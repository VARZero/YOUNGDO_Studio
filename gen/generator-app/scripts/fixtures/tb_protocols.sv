`timescale 1ns/1ps
module tb_protocols;
    bit clk=0, reset_n=0;
    always #5 clk=~clk;
    logic open_window,request,accept,done,error,bus_valid,failed,fault;
    logic [3:0] slot,bus_slot,fault_slot;
    logic [5:0] cause;
    logic [15:0] finished;
    oryukdo_sidefx_commit_bridge bridge(.clk,.reset_n,.i_window_open(open_window),
        .i_commit_request(request),.i_commit_slot(slot),.o_bus_valid(bus_valid),
        .o_bus_slot(bus_slot),.i_bus_ready(accept),.i_bus_done(done),.i_bus_error(error),
        .i_bus_error_cause(6'd13),.o_failed_response(failed),.o_sidefx_done(finished),
        .o_sidefx_exception_valid(fault),.o_sidefx_exception_slot(fault_slot),
        .o_sidefx_exception_cause(cause));
    logic [34:0] boundary;
    logic [4*35-1:0] tags;
    logic inclusive,active;
    wire [3:0] kill;
    oryukdo_recovery_boundary #(.FLOWS(5),.SLOT_W(32),.WRAPPING_PC(1),.LANES(4))
        guard(.i_recovery_active(active),.i_oldest_flow(3'd4),.i_boundary_tag(boundary),
        .i_boundary_inclusive(inclusive),.i_candidate_valid(4'b1111),.i_candidate_tag(tags),.o_kill(kill));
    task automatic tick; @(negedge clk); endtask
    initial begin
        open_window=0;request=0;accept=0;done=0;error=0;slot=0;
        active=1;inclusive=0;boundary={3'd0,32'hfffffffc};
        tags={{3'd4,32'h100},{3'd1,32'h0},{3'd0,32'h0},boundary};
        #1; if(kill!==4'b0110) $fatal(1,"Wrapped exclusive boundary %b",kill);
        inclusive=1; #1; if(kill!==4'b0111) $fatal(1,"Wrapped inclusive boundary");
        active=0; #1; if(kill!==0) $fatal(1,"Inactive boundary");
        tick();reset_n=1;
        request=1;slot=3;tick();request=0;slot=7;
        repeat(4) begin if(!bus_valid || bus_slot!=3 || finished!=0) $fatal(1,"Request changed before accept"); tick(); end
        accept=1;tick();accept=0;
        if(bus_valid || finished!=0) $fatal(1,"Acceptance treated as completion");
        repeat(3) tick();done=1;tick();done=0;
        request=1;slot=3;tick();request=0;
        if(bus_valid || finished!=16'h8) $fatal(1,"Repeated side effect");
        request=1;slot=8;tick();request=0;accept=1;done=1;error=1;
        #1; if(!failed) $fatal(1,"Immediate fault missing");
        tick();accept=0;done=0;error=0;
        if(bus_valid || !fault || fault_slot!=8 || cause!=13 || finished[8]) $fatal(1,"Fault acknowledged as success");
        open_window=1;tick();open_window=0;
        if(fault || finished!=0) $fatal(1,"Old response crossed windows");
        request=1;slot=0;tick();accept=1;done=1;tick();request=0;
        if(!finished[0] || bus_valid) $fatal(1,"Immediate success lost");
        $display("PASS wrapped PC and five-window age; side effects with backpressure, delayed completion, same-cycle success/error");
        $finish;
    end
endmodule
