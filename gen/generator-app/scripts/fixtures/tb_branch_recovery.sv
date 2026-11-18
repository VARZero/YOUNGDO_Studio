`timescale 1ns/1ps
module tb_branch_recovery;
    localparam int PC_W=32, FLOW_W=3, SLOT_W=4, PHY_W=6, LOGICAL_REGS=32;
    localparam int TAG_W=FLOW_W+SLOT_W, MAP_W=PHY_W*LOGICAL_REGS;
    logic clk=0, reset_n=0, push=0, resolve_valid=0, recovery_done=0;
    logic [TAG_W-1:0] push_tag='0, resolve_tag='0;
    logic [PC_W-1:0] push_pred='0, resolve_next='0;
    logic [MAP_W-1:0] push_map='0;
    wire push_ready, recovery_valid;
    wire [TAG_W-1:0] recovery_tag;
    wire [PC_W-1:0] redirect_pc;
    wire [MAP_W-1:0] restore_map;
    wire [5:0] outstanding;
    always #5 clk=~clk;
    `ifdef CHECKPOINT_NETLIST
    oryukdo_branch_recovery dut (
    `else
    oryukdo_branch_recovery #(.PC_W(PC_W),.FLOW_WINDOWS(8),
        .FLOW_W(FLOW_W),.SLOT_W(SLOT_W),.PHY_W(PHY_W),
        .LOGICAL_REGS(LOGICAL_REGS),.DEPTH(32),.PER_WINDOW(4)) dut (
    `endif
        .clk(clk),.reset_n(reset_n),.i_push(push),.o_push_ready(push_ready),
        .i_push_tag(push_tag),.i_push_predicted_next_pc(push_pred),
        .i_push_rename_map(push_map),.i_resolve_valid(resolve_valid),
        .i_resolve_tag(resolve_tag),.i_resolve_next_pc(resolve_next),
        .o_recovery_valid(recovery_valid),.o_recovery_tag(recovery_tag),
        .o_redirect_pc(redirect_pc),.o_restore_map(restore_map),
        .i_trap_flush(1'b0),.o_head_tag(),.i_recovery_done(recovery_done),.o_outstanding(outstanding)
    );
    task automatic add(input logic [TAG_W-1:0] tag,
                       input logic [PC_W-1:0] predicted,
                       input logic [MAP_W-1:0] mapping);
        @(negedge clk);
        if (!push_ready) $fatal(1,"unexpected checkpoint full");
        push=1;push_tag=tag;push_pred=predicted;push_map=mapping;
        @(negedge clk);push=0;
    endtask
    task automatic result(input logic [TAG_W-1:0] tag,
                          input logic [PC_W-1:0] actual);
        @(negedge clk);resolve_valid=1;resolve_tag=tag;resolve_next=actual;
        @(negedge clk);resolve_valid=0;
    endtask
    initial begin
        `ifdef CHECKPOINT_NETLIST
        repeat (12) @(negedge clk);
        `endif
        repeat (2) @(negedge clk); reset_n=1;
        add(7'h01,32'h104,192'h112233);
        add(7'h02,32'h108,192'h445566);
        // The younger failure cannot trigger before the oldest resolves.
        result(7'h02,32'h900);
        if (recovery_valid) $fatal(1,"out of order recovery");
        result(7'h01,32'h104);
        repeat(3) @(negedge clk);
        if (!recovery_valid || recovery_tag!=7'h02 ||
            redirect_pc!=32'h900 || restore_map!=192'h445566)
            $fatal(1,"wrong redirect / checkpoint");
        recovery_done=1;
        @(negedge clk);recovery_done=0;
        if (recovery_valid || outstanding!=0) $fatal(1,"recovery did not drain");
        for (int k=0;k<4;k++) add(TAG_W'(k),32'(4*k+4),MAP_W'(int'(k+100)));
        push_tag=7'h04; #1;
        if(push_ready || outstanding!=4) $fatal(1,"Fifth checkpoint in one window");
        push_tag=7'h10; #1;
        add(7'h10,32'h304,192'd5);
        result(7'h10,32'h444);
        result(7'h03,32'h333);
        result(7'h02,32'h222);
        repeat(4) begin @(negedge clk); if(recovery_valid) $fatal(1,"Younger result won"); end
        result(7'h00,32'h111);
        repeat(3) @(negedge clk);
        if(!recovery_valid || recovery_tag!=0 || redirect_pc!=32'h111 || restore_map!=192'd100)
            $fatal(1,"Wrong oldest mispredict");
        recovery_done=1; @(negedge clk); recovery_done=0;
        // Drive head and tail through a full pointer wrap on correct predictions.
        for(int j=0;j<40;j++) begin
            add(TAG_W'(j),32'(j+4),MAP_W'(j)); result(TAG_W'(j),32'(j+4));
            @(negedge clk); if(recovery_valid || outstanding!=0) $fatal(1,"Checkpoint pointer wrap");
        end
        $display("PASS tb_branch_recovery (capacity, program order, restore, pointer wrap)");$finish;
    end
endmodule
