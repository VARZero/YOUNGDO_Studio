`timescale 1ns/1ps
module tb_gen3 #(parameter bit CUSTOM=0);
    localparam int D=3, E=5, T=35, RD=T+39, IW=RD+18, RW=T+6;
    bit clk=0, reset_n=0;
    always #5 clk=~clk;
    logic [D-1:0] req,req_get,im,im_get,newreg,branch,decode_fault,prep;
    logic [D*T-1:0] req_pc,im_pc,prep_tag;
    logic [D*5-1:0] rd;
    logic [D*10-1:0] rs;
    logic [D*2-1:0] path;
    logic [E-1:0] issue,take,wb,accepted,killed_result,killed_issue,fault;
    logic [E*IW-1:0] inst;
    logic [E*RW-1:0] result;
    logic [E*T-1:0] fault_tag;
    logic [E*6-1:0] fault_phy;
    logic br_valid,irq,trap,trap_irq,trap_ack,redirect,sfx,ready,done;
    logic [T+32-1:0] br_data;
    logic [T-1:0] sfx_tag;
    logic [31:0] epc,tval,redirect_pc;
    logic [5:0] cause;
    logic [15:0] commit;
    logic [31:0] commit_base_pc;
    int outstanding_fault_windows,max_fault_windows;
    int cycles,expected,commits,max_decode,max_issue,max_commit,traps,redirects,effects;
    int max_cp,full_stalls,issue_discards,result_discards,lsq_cancels,seed,goal;
    int scenario,collisions;
    logic query,query_ready,response,response_ready,pred_taken;
    logic [T-1:0] query_tag,response_tag;
    logic [31:0] pred_pc;
    int response_due;
    oryukdo_gen3_scheduler #(.USE_CUSTOM_BRANCH_PREDICTOR(CUSTOM)) dut (.clk,.reset_n,.o_im_req_pc_valid(req),.i_im_req_pc_get(req_get),
        .o_im_req_pc(req_pc),.i_im_recv_inst_valid(im),.o_im_recv_inst_get(im_get),.i_im_recv_pc(im_pc),
        .i_im_recv_inst('0),.i_nel_decode_exception(decode_fault),.i_nel_decode_expath(path),
        .i_nel_decode_microop('0),.i_nel_decode_rd(rd),.i_nel_decode_newreg(newreg),.i_nel_decode_rs(rs),
        .i_nel_decode_imm('0),.i_nel_decode_jump('0),.i_nel_decode_jump_reg('0),.i_nel_decode_branch(branch),
        .o_rs_entry_valid(issue),.i_rs_entry_get(take),.o_rs_entry_data(inst),.i_wbc_result_valid(wb),
        .i_wbc_result_data(result),.i_wbc_result_branch_valid(br_valid),.i_wbc_result_branch_data(br_data),
        .i_sidefx_valid(prep),.i_sidefx_tag(prep_tag),.i_exception_valid(fault),.i_exception_tag(fault_tag),
        .i_exception_phyreg(fault_phy),.i_exception_cause({E{6'd5}}),.i_exception_tval({E{32'hbad0}}),
        .i_interrupt_pending(irq),.i_interrupt_cause(6'd7),.i_trap_vector_pc(traps==1 ? 32'd1024 : 32'd512),
        .o_trap_csr_request(trap),.o_trap_epc(epc),.o_trap_tval(tval),.o_trap_cause(cause),
        .o_trap_interrupt(trap_irq),.i_trap_csr_done(trap_ack),.o_sidefx_valid(sfx),.o_sidefx_tag(sfx_tag),
        .i_sidefx_ready(ready),.i_sidefx_done(done),.i_sidefx_error(scenario==2 && expected==37),.i_sidefx_error_cause(6'd15),.i_sidefx_error_tval(32'hfeed),
        .o_commit_fire(commit),.o_commit_base_pc(commit_base_pc),.o_redirect_valid(redirect),.o_redirect_pc(redirect_pc),
        .o_predict_query_valid(query),.o_predict_query_tag(query_tag),.i_predict_query_ready(query_ready),
        .i_predict_response_valid(response),.i_predict_response_tag(response_tag),.o_predict_response_ready(response_ready),
        .i_predict_response_taken(pred_taken),.i_predict_response_target(pred_pc),
        .i_oryukdo_issue_kill('0),.i_oryukdo_result_kill('0),.o_oryukdo_issue_discard(killed_issue),
        .o_oryukdo_result_discard(killed_result),.o_wbc_accept(accepted));
    int reordered_issues;
    int highest_issued;
    function automatic bit younger(input logic [T-1:0] tag_value);
        logic [2:0] candidate_age,boundary_age;
        candidate_age=tag_value[T-1:32]-dut.ctrl_kill_oldest;
        boundary_age=dut.ctrl_kill_boundary[T-1:32]-dut.ctrl_kill_oldest;
        return candidate_age>boundary_age || (candidate_age==boundary_age &&
            ($signed(tag_value[31:0]-dut.ctrl_kill_boundary[31:0])>0 ||
             (dut.ctrl_kill_inclusive && tag_value==dut.ctrl_kill_boundary)));
    endfunction
    // Address-indexed program generator. Fetching a tag again always produces
    // the same decoded operation, independently of EX and bus timing.
    function automatic int unsigned instruction_word(int id);
        int unsigned h;
        h=(id^seed)*32'h85ebca6b;
        h=(h^(h>>13))*32'hc2b2ae35;
        return h^(h>>16);
    endfunction
    function automatic bit is_branch(int id);
        return id inside {[1:5],10,35,[145:149]} || (scenario==3 && id==42) || (id>=256 && id%113==24);
    endfunction
    function automatic bit side(int id);
        return (id inside {6,33,37,40}) ||
            (id>=128 && !is_branch(id) && instruction_word(id)%23==0);
    endfunction
    function automatic bit mem(int id);
        return side(id) || (!is_branch(id) && id%13==9) || id==39;
    endfunction
    function automatic int dest(int id);
        if(side(id) && id%3==0) return 0;
        return id<256 ? (id/2)%12+1 : int'(instruction_word(id)%14)+1;
    endfunction
    function automatic int src(int id);
        if(scenario==3 && id==42) return 0; // independent younger branch
        if(id%4==1) return dest(id-1);
        return id<256 ? id%17 : int'((instruction_word(id)>>8)%18);
    endfunction
    function automatic int next_id(int id);
        if(id==5) return 32;
        if(scenario==3 && id==42) return 212;
        if(id>=256 && is_branch(id) && (id/113)%3!=0) return id+9;
        return id+1;
    endfunction
    always_comb for (int d=0;d<D;d++) begin
        int id; id=int'(im_pc[d*T+:32]/4);
        rd[d*5+:5]=5'(dest(id)); newreg[d]=dest(id)!=0;
        rs[d*10+:10]={5'(id%7),5'(src(id))};
        path[d*2+:2]=mem(id) ? 2'd2 : 2'(id%3==0 ? 0 : 1);
        branch[d]=is_branch(id); decode_fault[d]=id==8 || id==43 || id==50 || (scenario==1 && id==4);
    end
    typedef struct packed {logic [T-1:0] tag; logic [5:0] phy; int value; int due;} event_t;
    event_t pending[$], outcomes[$], active_bus;
    int bus_due;
    int phys[64],arch[32],values[int],wb_values[E];
    bit owns[64],authorized[int];
    int committed_map[32];
    int mem_data,csr,mmio_reads,ref_mem,ref_csr,ref_reads;
    logic [D-1:0] next_im;
    logic [D*T-1:0] next_im_pc;
    int rng;
    function automatic int unsigned randword();
        rng=rng^(rng<<13); rng=rng^(rng>>17); rng=rng^(rng<<5); return rng;
    endfunction
    always @(posedge clk) if (dut.io_live) begin
        cycles++;
        if(irq && br_valid && (|fault)) collisions++;
        if (query && query_ready) begin
            if(response_due!=0 || response) $fatal(1,"Repeated predictor query");
            response_tag<=query_tag; response_due=cycles+3;
        end
        if(response && response_ready) response_due=0;
        if($test$plusargs("trace") && cycles<240)
            $display("cycle=%0d im=%b req=%b rename=%b tag=%h phys=%h take=%b issue=%b wb=%b commit=%h kill=%b",
                cycles,im,req,dut.rename_rd_valid,dut.rename_rd_tag,dut.rename_phy,take,issue,wb,commit,dut.ctrl_kill_active);
        next_im=im & ~im_get; next_im_pc=im_pc;
        if (|(req & req_get)) begin next_im=req & req_get; next_im_pc=req_pc; end
        outstanding_fault_windows=0;
        for(int w=0;w<8;w++) if(dut.U_FLOW_CONTROL_LOGIC.fdu_active[w] && (|dut.U_FLOW_CONTROL_LOGIC.fdu_exception[w]))
            outstanding_fault_windows++;
        if(outstanding_fault_windows>max_fault_windows) max_fault_windows=outstanding_fault_windows;
        if ($countones(dut.nel_fcl_new_inst_valid)>max_decode) max_decode=$countones(dut.nel_fcl_new_inst_valid);
        if ($countones(issue & take)>max_issue) max_issue=$countones(issue & take);
        if ($countones(commit)>max_commit) max_commit=$countones(commit);
        if (int'(dut.U_CONTROL_PLANE.branch_count)>max_cp) max_cp=int'(dut.U_CONTROL_PLANE.branch_count);
        if (dut.branch_candidate_valid && !dut.checkpoint_ready) full_stalls++;
        issue_discards+=$countones(killed_issue); result_discards+=$countones(killed_result);
        if (dut.lsq_ready_discard_valid) lsq_cancels++;
        for (int d=0;d<D;d++) if (dut.rename_rd_valid[d]) begin
            int p; p=int'(dut.rename_phy[d*6+:6]);
            if (p==0 || owns[p]) $fatal(1,"Duplicate physical allocation p=%0d raw=%h lane=%0d id=%0d cycle=%0d",p,dut.rename_phy,d,int'(dut.rename_rd_tag[d*T+:32]/4),cycles);
            owns[p]=1;
        end
        for (int d=0;d<4;d++) if (dut.fcl_prm_unallocate_phyreg_valid[d]) begin
            int p; p=int'(dut.fcl_prm_unallocate_phyreg_data[d*6+:6]);
            if (!owns[p]) $fatal(1,"Double physical return p=%0d",p);
            foreach(committed_map[r]) if(committed_map[r]==p) $fatal(1,"Returned architectural PHY %0d",p);
            owns[p]=0;
        end
        for(int e=0;e<E;e++) if(wb[e]) begin
            if(accepted[e] !== !(dut.ctrl_kill_active && younger(result[e*RW+:T])))
                $fatal(1,"Result guard accepted wrong tag or lost live result");
        end
        for(int e=0;e<E;e++) if (accepted[e]) begin
            int p,id; p=int'(result[e*RW+T+:6]); id=int'(result[e*RW+:32]/4);
            if(p!=0) phys[p]=wb_values[e]; values[id]=wb_values[e];
        end
        for(int e=0;e<E;e++) if(issue[e] && take[e]) begin
            event_t ev; int id,a,b;
            ev.tag=inst[e*IW+:T]; id=int'(ev.tag[31:0]/4); ev.phy=inst[e*IW+RD+:6];
            a=int'(inst[e*IW+RD+6+:6]); b=int'(inst[e*IW+RD+12+:6]);
            ev.value=phys[a]+phys[b]+id+1;
            if(mem(id) && !side(id)) ev.value=mem_data;
            ev.due=cycles+(id==1 ? 110 : id==5 ? 80 : id==39 ? 55 : 1+int'(randword()%25));
            if(id<highest_issued) reordered_issues++;
            if(id>highest_issued) highest_issued=id;
            pending.push_back(ev);
        end
        for(int s=0;s<16;s++) if(commit[s]) begin
            int id,v; id=int'(commit_base_pc/4)+s;
            if(id!=expected || id==39 || id==50 || id==8 || (scenario==1 && id==4) || (scenario==2 && id==37)) $fatal(1,"Commit PC expected %0d got %0d cycle %0d",expected,id,cycles);
            v=arch[src(id)]+arch[id%7]+id+1;
            if(side(id)) begin
                case(id%3)
                    0: ref_mem=v;
                    1: begin int prior; prior=ref_csr; ref_csr=v; v=prior; end
                    2: begin v=ref_reads; ref_reads++; end
                endcase
                if(ref_mem!=mem_data || ref_csr!=csr || ref_reads!=mmio_reads)
                    $fatal(1,"Committed device state diverged id=%0d",id);
            end else if(mem(id)) v=ref_mem;
            if(dest(id)!=0) begin
                if(values.exists(id)==0 || values[id]!=v) $fatal(1,"Commit value id=%0d expected=%0h got=%0h",id,v,values[id]);
                arch[dest(id)]=v; committed_map[dest(id)]=int'(dut.oldest_rename_phy[s*6+:6]);
            end
            if(side(id) && authorized.exists(id)==0) $fatal(1,"Side effect missing id=%0d",id);
            expected=next_id(id); commits++;
        end
        if(sfx && ready) begin
            int id; id=int'(sfx_tag[31:0]/4);
            if(id!=expected || !side(id) || authorized.exists(id)!=0) $fatal(1,"Bad external effect id=%0d expected=%0d",id,expected);
            authorized[id]=1; effects++; bus_due=cycles+4;
            foreach(pending[i]) if(pending[i].tag==sfx_tag) active_bus=pending[i];
            if(active_bus.tag!=sfx_tag || active_bus.due!=-1) $fatal(1,"Effect was never prepared");
            if(!(scenario==2 && id==37)) case(id%3)
                0: mem_data=active_bus.value;
                1: begin int prior; prior=csr; csr=active_bus.value; active_bus.value=prior; end
                2: begin active_bus.value=mmio_reads; mmio_reads++; end
            endcase
        end
        if(trap && trap_ack) begin
            if(epc!=32'(expected*4) || (trap_irq ? cause!=7 : (scenario==1 ? (cause!=2 || tval!=0 || expected!=4) : scenario==2 ? (cause!=15 || tval!=32'hfeed || expected!=37) : (cause!=5 || tval!=32'hbad0 || expected!=39))))
                $fatal(1,"Trap epc=%0d cause=%0d expected=%0d",epc,cause,expected*4);
            traps++;
        end
        if(redirect) begin
            int target;
            target=dut.ctrl_recovery_kind==0 ? next_id(int'(dut.ctrl_kill_boundary[31:0]/4)) : (trap_irq ? 256 : 128);
            if(redirect_pc!=32'(target*4)) $fatal(1,"Wrong redirect %0d expected %0d",redirect_pc,target*4);
            if(dut.ctrl_recovery_kind==0) begin
                int id,slot;
                id=int'(dut.ctrl_kill_boundary[31:0]/4);
                slot=id-int'(commit_base_pc/4);
                if(id!=expected || !is_branch(id)) $fatal(1,"Mispredict recovery passed an older instruction");
                for(int r=0;r<32;r++) begin
                    int expected_phy;
                    expected_phy=committed_map[r];
                    if(r!=0 && r==dest(id)) expected_phy=int'(dut.oldest_rename_phy[slot*6+:6]);
                    if(dut.o_rename_snapshot[r*6+:6] !== 6'(expected_phy))
                        $fatal(1,"Branch restore mismatch r%0d id=%0d",r,id);
                end
            end
            if(dut.ctrl_recovery_kind!=0) begin
                for(int r=0;r<32;r++)
                    if(dut.o_rename_snapshot[r*6+:6] !== 6'(committed_map[r]))
                        $fatal(1,"Trap map r%0d expected=%0d got=%0d",r,committed_map[r],dut.o_rename_snapshot[r*6+:6]);
                expected=target;
            end
            redirects++;
        end
        for(int w=0;w<8;w++) if(dut.U_FLOW_CONTROL_LOGIC.fdu_release[w]) begin
            foreach(pending[i]) if(int'(pending[i].tag[T-1:32])==w) $fatal(1,"Early window release");
            foreach(outcomes[i]) if(int'(outcomes[i].tag[T-1:32])==w) $fatal(1,"Early branch tag reuse");
        end
    end
    always @(negedge clk) if(dut.io_live) begin
        int n,p,idx;
        if(response_due==0) response=0;
        query_ready=cycles%3!=0;
        if(response_due!=0 && response_due<=cycles) begin
            response=1; pred_taken=response_tag[31:0]==20;
            pred_pc=pred_taken ? 128 : 32'hdead; // ignored when predicting not taken
        end
        im=next_im; im_pc=next_im_pc; req_get=(im==0 && randword()%5!=0) ? '1 : '0;
        take=5'(randword());
        // Periodic external stalls build a backlog on all three EX paths.
        // Release all lanes together and measure actual transfers.
        if(expected>256 && cycles%701<55) take='0;
        else if(expected>256 && cycles%701<62) take='1;
        wb='0;result='0;fault='0;fault_tag='0;fault_phy='0;prep='0;prep_tag='0;br_valid=0;
        ready=(randword()%4!=0); trap_ack=trap && cycles%3==0;
        irq=(expected>=140 && expected<256 && traps==1) || (expected==39 && traps==0);
        done=bus_due!=0 && cycles>=bus_due; n=0;p=0;
        if(done) begin
            wb[0]=!(scenario==2 && expected==37);result[0+:RW]={active_bus.phy,active_bus.tag};wb_values[0]=active_bus.value;n=1;bus_due=0;
        end
        idx=pending.size()-1;
        while(idx>=0 && n<E) begin
            event_t ev; int id; bit kill,hold_fault;
            ev=pending[idx];id=int'(ev.tag[31:0]/4);
            kill=dut.ctrl_kill_active && younger(ev.tag);
            if(side(id) && ev.due==-1 && kill) ev.due=cycles;
            hold_fault=(scenario==3 && redirects!=0 && traps==0 && id==39) || (scenario==4 && id==7);
            if(hold_fault) foreach(outcomes[j]) begin
                if(outcomes[j].tag[31:0]==(scenario==3 ? 168 : 20)) hold_fault=0;
            end
            if(!hold_fault && ev.due>=0 && ev.due<=cycles && !(br_valid && is_branch(id))) begin
                if(side(id) && !kill && p<D) begin
                    prep[p]=1;prep_tag[p*T+:T]=ev.tag;p++;
                    pending[idx].due=-1;
                end else if (!side(id) || kill) begin
                    if(id==39 || (scenario==4 && id==7)) begin fault[n]=1;fault_tag[n*T+:T]=ev.tag;fault_phy[n*6+:6]=ev.phy;end
                    else begin wb[n]=1;result[n*RW+:RW]={ev.phy,ev.tag};wb_values[n]=ev.value;end
                    if(is_branch(id)) begin
                        ev.due=cycles+((scenario==3 && id==42)||(scenario==4 && id==5) ? 0 : id==10 ? 400 : 2);
                        outcomes.push_back(ev);
                    end
                    n++;pending.delete(idx);
                end
            end
            if(done && ev.tag==active_bus.tag && ev.due==-1) pending.delete(idx);
            idx--;
        end
        for(int j=outcomes.size()-1;j>=0;j--) if(outcomes[j].due<=cycles && !br_valid) begin
            event_t ev;
            if ((scenario==3 && redirects!=0 && traps==0 && outcomes[j].tag[31:0]==168) || (scenario==4 && outcomes[j].tag[31:0]==20)) begin
                if (!(|fault)) continue;
                irq=1;
            end
            ev=outcomes[j]; outcomes.delete(j);
            br_valid=1;br_data={32'(next_id(int'(ev.tag[31:0]/4))*4),ev.tag};
        end
    end
    task automatic reset_model();
        response=0;response_due=0;response_tag='0;query_ready=0;pred_taken=0;pred_pc=0;
        collisions=0;max_fault_windows=0;cycles=0;expected=0;commits=0;max_decode=0;max_issue=0;max_commit=0;traps=0;redirects=0;effects=0;
        max_cp=0;full_stalls=0;issue_discards=0;result_discards=0;lsq_cancels=0;bus_due=0;highest_issued=0;
        // A board reset flushes pending backend transactions, but committed
        // external memory and device state survive a scheduler restart.
        ref_mem=mem_data; ref_csr=csr; ref_reads=mmio_reads;
        pending.delete(); outcomes.delete(); values.delete(); authorized.delete();
        active_bus='0; reordered_issues=0;
        foreach(owns[i]) owns[i]=0;
        foreach(phys[i]) phys[i]=0;
        foreach(arch[i]) begin arch[i]=0; committed_map[i]=0; end
        rng=seed;
        im='0;im_pc='0;wb='0;take='0;req_get='0;fault='0;fault_tag='0;fault_phy='0;
        prep='0;prep_tag='0;result='0;br_valid=0;br_data='0;irq=0;trap_ack=0;ready=0;done=0;
        next_im='0;next_im_pc='0;
    endtask

    task automatic check_isolated();
        if ({issue, req, im_get, accepted, killed_issue, killed_result, commit, sfx,
             trap, redirect, query, response_ready, dut.o_backend_kill_valid,
             dut.o_predict_update_valid} !== '0)
            $fatal(1,"Transfer visible across reset");
    endtask

    initial begin #3100000; $fatal(1,"Simulation or reset handshake timed out"); end
    int warm_resets;
    bit warm_test;
    task automatic pulse_reset(input time width_ns);
        reset_n=0;
        #1;
        check_isolated();
        if (!dut.core_reset_n) $fatal(1,"Core reset changed between clock edges");
        reset_model();
        #(width_ns-1);
        reset_n=1;
        check_isolated();
        // The pulse catcher must also stretch a pulse wholly between edges.
        wait (!dut.core_reset_n);
        // Let continuous assignments settle at the reset clock edge. Exercise
        // arbitrary data/valid from a backend being reset along with the core.
        wb='1; im='1; ready=1; take='1;
        #1; check_isolated();
        @(negedge clk); wb='0; im='0; ready=0; take='0;
        @(posedge dut.io_live);
        if (dut.o_rename_snapshot !== '0 || dut.U_CONTROL_PLANE.branch_count !== 0 ||
            dut.G_LSQ.U_LSQ.order_count !== 0 || dut.G_LSQ.U_LSQ.upper_count !== 0)
            $fatal(1,"Stale mapping, LSQ or checkpoints after reset");
        warm_resets++;
    endtask

    initial begin
        warm_test=$test$plusargs("warm_reset"); warm_resets=0;
        if(!$value$plusargs("scenario=%d",scenario)) begin
            if($test$plusargs("older_fault")) scenario=3;
            else if($test$plusargs("older_branch")) scenario=4;
            else scenario=0;
        end
        if(!$value$plusargs("seed=%d",seed)) seed=91;
        if(!$value$plusargs("goal=%d",goal)) goal=2000;
        mem_data=0; csr=0; mmio_reads=0; reset_model();
        repeat(4) @(posedge clk); #1; reset_n=1;
        repeat(300000) begin
            @(posedge clk); #2;
            if(warm_test) begin
                if(warm_resets==0 && dut.U_CONTROL_PLANE.branch_count!=0 && dut.G_LSQ.U_LSQ.order_count!=0)
                    pulse_reset(2);
                else if(warm_resets==1 && sfx)
                    pulse_reset(16);
                else if(warm_resets==2 && dut.ctrl_kill_active && effects!=0)
                    pulse_reset(3);
            end
            if(commits>=goal) begin
                if(warm_test && warm_resets!=3) $fatal(1,"Missing reset coverage %0d",warm_resets);
                if(((scenario==3 || scenario==4) && collisions!=1) || traps!=2 || redirects<((scenario==1 || CUSTOM) ? 2 : 3) || max_decode<3 || max_issue<2 || max_commit<2 ||
                    reordered_issues==0 || (scenario!=1 && (max_cp<4 || full_stalls==0)) || effects<2 || (goal>=5000 && max_issue!=5))
                    $fatal(1,"Coverage traps=%0d redirects=%0d decode=%0d issue=%0d commit=%0d cp=%0d stalls=%0d reordered=%0d effects=%0d collisions=%0d scenario=%0d goal=%0d",traps,redirects,max_decode,max_issue,max_commit,max_cp,full_stalls,reordered_issues,effects,collisions,scenario,goal);
                $display("PASS seed=%0d cycles=%0d committed=%0d max_decode/issue/commit=%0d/%0d/%0d checkpoints=%0d full_stalls=%0d issue/result/LSQ_discards=%0d/%0d/%0d side_effects=%0d traps=%0d simultaneous_fault_windows=%0d triple_collisions=%0d warm_resets=%0d",seed,cycles,commits,max_decode,max_issue,max_commit,max_cp,full_stalls,issue_discards,result_discards,lsq_cancels,effects,traps,max_fault_windows,collisions,warm_resets);
                $finish;
            end
            if(cycles>2000 && commits<60) $fatal(1,"Stalled id=%0d cp=%0d head=%0d cursor=%0d mask=%h done=%h killed=%h busy=%b batch=%b fetched=%b pending=%0d",expected,dut.U_CONTROL_PLANE.branch_count,dut.oldest_flow,dut.U_CONTROL_PLANE.commit_cursor,dut.oldest_admitted,dut.oldest_done,dut.oldest_killed,dut.ctrl_recovery_busy,dut.U_FLOW_CONTROL_LOGIC.batch_active,dut.fcl_fetch_drained,pending.size());
        end
        $fatal(1,"Stress timeout expected=%0d",expected);
    end
endmodule
