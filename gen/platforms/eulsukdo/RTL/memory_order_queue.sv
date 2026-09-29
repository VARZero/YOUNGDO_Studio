`timescale 1ns/1ps
module memory_order_queue #(
    parameter int FLOW_PC_WIDTH = 35,
    parameter int ADDRESS_WIDTH = 32,
    parameter int DATA_WIDTH = 32,
    parameter int MASK_WIDTH = 4,
    parameter int PHYREG_WIDTH = 6,
    parameter int MICROOP_WIDTH = 5,
    parameter int OPERANDS = 2,
    parameter int EXPATH_WIDTH = 2,
    parameter int MEMORY_PATH = 2,
    parameter int NEL_LANES = 2,
    parameter int DEPTH = 128,
    localparam int INTERNAL_WIDTH = FLOW_PC_WIDTH + EXPATH_WIDTH + MICROOP_WIDTH
                                  + ADDRESS_WIDTH + PHYREG_WIDTH*(1+OPERANDS) + OPERANDS,
    localparam int PAYLOAD_WIDTH = 1 + ADDRESS_WIDTH + DATA_WIDTH + MASK_WIDTH
                                 + PHYREG_WIDTH + MICROOP_WIDTH,
    localparam int COUNT_WIDTH = $clog2(DEPTH+1),
    localparam int SLOT_WIDTH = (DEPTH > 1) ? $clog2(DEPTH) : 1
) (
    input  wire clk,
    input  wire reset_n,
    input  wire [NEL_LANES-1:0] i_nel_valid,
    input  wire [NEL_LANES*INTERNAL_WIDTH-1:0] i_nel_data,
    output wire o_nel_ready,
    input  wire i_agu_valid,
    output wire o_agu_get,
    input  wire [FLOW_PC_WIDTH-1:0] i_agu_key,
    input  wire [PAYLOAD_WIDTH-1:0] i_agu_payload,
    output wire o_mem_req_valid,
    input  wire i_mem_req_get,
    output wire [FLOW_PC_WIDTH-1:0] o_mem_req_key,
    output wire [PAYLOAD_WIDTH-1:0] o_mem_req_payload,
    input  wire i_mem_resp_valid,
    input  wire [DATA_WIDTH-1:0] i_mem_resp_data,
    output wire o_mem_resp_ready,
    output wire o_mem_complete_valid,
    output wire [FLOW_PC_WIDTH-1:0] o_mem_complete_key,
    output wire [PHYREG_WIDTH-1:0] o_mem_complete_rd,
    output wire [DATA_WIDTH-1:0] o_mem_complete_data
);
    logic [FLOW_PC_WIDTH-1:0] order_key [0:DEPTH-1];
    logic [COUNT_WIDTH-1:0] order_count;
    logic [SLOT_WIDTH-1:0] order_head, order_tail;

    logic [FLOW_PC_WIDTH-1:0] ready_key [0:DEPTH-1];
    logic [SLOT_WIDTH-1:0] ready_slot [0:DEPTH-1];
    logic [COUNT_WIDTH-1:0] ready_count;
    logic [SLOT_WIDTH-1:0] scan;
    logic [DEPTH-1:0] slot_used;
    logic [PAYLOAD_WIDTH-1:0] result_buffer [0:DEPTH-1];
    logic free_found;
    logic [SLOT_WIDTH-1:0] free_slot;

    logic head_valid;
    logic [FLOW_PC_WIDTH-1:0] head_key;
    logic [PAYLOAD_WIDTH-1:0] head_payload;
    logic memory_busy;
    logic [FLOW_PC_WIDTH-1:0] inflight_key;
    logic [PHYREG_WIDTH-1:0] inflight_rd;

    logic [NEL_LANES-1:0] nel_memory;
    logic [COUNT_WIDTH-1:0] nel_count;
    logic scan_match, use_head, request_fire, ready_push, head_push;
    wire [FLOW_PC_WIDTH-1:0] order_front = order_key[order_head];

    function automatic [SLOT_WIDTH-1:0] wrap_next(input [SLOT_WIDTH-1:0] position);
        return (position == SLOT_WIDTH'(DEPTH-1)) ? '0 : position + 1'b1;
    endfunction

    // NEL only emits a valid bundle once every lane can be accepted by IST.
    // Reserve enough room for a complete bundle, regardless of its path mix.
    assign o_nel_ready = order_count <= COUNT_WIDTH'(DEPTH-NEL_LANES);
    always_comb begin
        nel_memory = '0;
        nel_count = '0;
        for (int lane = 0; lane < NEL_LANES; lane++) begin
            if (i_nel_valid[lane] &&
                i_nel_data[lane*INTERNAL_WIDTH + FLOW_PC_WIDTH +: EXPATH_WIDTH] == EXPATH_WIDTH'(MEMORY_PATH)) begin
                nel_memory[lane] = 1'b1;
                nel_count = nel_count + 1'b1;
            end
        end
    end

    always_comb begin
        free_found = 1'b0;
        free_slot = '0;
        for (int slot = 0; slot < DEPTH; slot++) begin
            if (!free_found && !slot_used[slot]) begin
                free_found = 1'b1;
                free_slot = SLOT_WIDTH'(slot);
            end
        end
    end

    assign scan_match = (order_count != 0) && (ready_count != 0) &&
                        (ready_key[scan] == order_front);
    assign use_head = head_valid && (order_count != 0) && (head_key == order_front);
    assign o_mem_req_valid = !memory_busy && (use_head || scan_match);
    assign o_mem_req_key = use_head ? head_key : ready_key[scan];
    assign o_mem_req_payload = use_head ? head_payload : result_buffer[ready_slot[scan]];
    assign request_fire = o_mem_req_valid && i_mem_req_get;

    // A head result bypasses A. A dedicated register holds it while memory is busy.
    // Other results need a free A slot; upstream AGU/EX must honor o_agu_get.
    assign o_agu_get = (order_count != 0) &&
                       ((i_agu_key == order_front) ? !head_valid :
                        (free_found && ready_count < COUNT_WIDTH'(DEPTH)));
    assign head_push = i_agu_valid && o_agu_get && i_agu_key == order_front && !head_valid;
    assign ready_push = i_agu_valid && o_agu_get && !head_push;

    assign o_mem_resp_ready = memory_busy;
    assign o_mem_complete_valid = memory_busy && i_mem_resp_valid;
    assign o_mem_complete_key = inflight_key;
    assign o_mem_complete_rd = inflight_rd;
    assign o_mem_complete_data = i_mem_resp_data;

    for (genvar idx = 0; idx < DEPTH; idx++) begin : GEN_READY_ENTRIES
        always_ff @(posedge clk) begin
            if (reset_n) begin
                if (idx < DEPTH-1) begin
                    if (request_fire && !use_head &&
                        idx >= int'(scan) && idx < int'(ready_count)-1) begin
                        ready_key[idx] <= ready_key[idx+1];
                        ready_slot[idx] <= ready_slot[idx+1];
                    end
                end
                if (ready_push &&
                    idx == int'(ready_count)-int'(request_fire && !use_head)) begin
                    ready_key[idx] <= i_agu_key;
                    ready_slot[idx] <= free_slot;
                end
            end
        end
    end

    always_ff @(posedge clk or negedge reset_n) begin
        logic [SLOT_WIDTH-1:0] tail_cursor;
        if (!reset_n) begin
            order_count <= '0;
            order_head <= '0;
            order_tail <= '0;
            ready_count <= '0;
            scan <= '0;
            slot_used <= '0;
            head_valid <= 1'b0;
            head_key <= '0;
            head_payload <= '0;
            memory_busy <= 1'b0;
            inflight_key <= '0;
            inflight_rd <= '0;
        end else begin
            tail_cursor = order_tail;
            if (o_nel_ready) begin
                for (int lane = 0; lane < NEL_LANES; lane++) begin
                    if (nel_memory[lane]) begin
                        order_key[tail_cursor] <= i_nel_data[lane*INTERNAL_WIDTH +: FLOW_PC_WIDTH];
                        tail_cursor = wrap_next(tail_cursor);
                    end
                end
                order_tail <= tail_cursor;
            end
            order_count <= order_count + (o_nel_ready ? nel_count : '0) - COUNT_WIDTH'(request_fire);
            if (request_fire) order_head <= wrap_next(order_head);

            if (head_push) begin
                head_valid <= 1'b1;
                head_key <= i_agu_key;
                head_payload <= i_agu_payload;
            end
            if (request_fire && use_head) head_valid <= 1'b0;

            if (request_fire && !use_head) begin
                slot_used[ready_slot[scan]] <= 1'b0;
                scan <= '0;
            end else if (ready_count != 0 && !memory_busy && !o_mem_req_valid) begin
                scan <= (scan == SLOT_WIDTH'(ready_count-1'b1)) ? '0 : scan + 1'b1;
            end
            if (ready_push) begin
                result_buffer[free_slot] <= i_agu_payload;
                slot_used[free_slot] <= 1'b1;
            end
            ready_count <= ready_count + COUNT_WIDTH'(ready_push)
                                      - COUNT_WIDTH'(request_fire && !use_head);

            if (request_fire) begin
                memory_busy <= 1'b1;
                inflight_key <= o_mem_req_key;
                inflight_rd <= o_mem_req_payload[MICROOP_WIDTH +: PHYREG_WIDTH];
            end
            if (o_mem_complete_valid) memory_busy <= 1'b0;
        end
    end
endmodule
