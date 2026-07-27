/* =========================================================
 * parent.js —— 家长端（浅绿主题）
 * 学习报告 / 错题同步+辅导重点 / AI家庭辅导建议
 * ========================================================= */
(function (global) {
  'use strict';
  var App=global.App=global.App||{};
  function myStudent(){ var db=DB.get(); return App.user.studentId?DB.byId(db.students,App.user.studentId):null; }

  function render(sub){
    sub=sub||'home';
    var stu=myStudent();
    if(!stu && sub!=='bind'){ return needBind(); }
    if(sub==='bind') return bind();
    if(sub==='home') return home(stu);
    if(sub==='report') return reportView(stu);
    if(sub==='wrong') return wrongView(stu);
    if(sub==='advice') return advice(stu);
    return home(stu);
  }

  function needBind(){ return set(card('关联孩子', '<p class="muted">尚未关联孩子账号。请让孩子的老师绑定，或在下方输入孩子的手机号自行关联。</p><div class="row"><a class="btn btn-primary" href="#/parent/bind">去关联</a></div>')); }
  function bind(){
    var body='孩子手机号 <input id="bd-phone" maxlength="11" placeholder="孩子注册手机号"><br><br><span class="muted">关联后即可查看孩子的作业、错题与报告。</span>'+
      '<div class="row" style="margin-top:12px"><button class="btn btn-primary" id="bd-go">关联</button></div>';
    var after=function(){
      var b=document.getElementById('bd-go');
      if(b){
        b.onclick=function(){
          var db=DB.get();
          var phone=document.getElementById('bd-phone').value;
          var stu=DB.byPhone(db.students,phone);
          if(!stu){ UI.toast('未找到该学生'); return; }
          App.user.studentId=stu.id;
          if(!stu.parentId){ stu.parentId=App.user.id; }
          DB.save(db);
          UI.toast('已关联 '+stu.name);
          App.go('#/parent/home');
        };
      }
    };
    return set(card('关联孩子', body), after);
  }

  function home(stu){
    var r=AI.studentReport(stu.id);
    var html=card('👪 '+App.user.name+'（孩子：'+stu.name+'）', grid4([
      stat(r.points,'孩子积分'), stat(r.wrongCount,'错题数'),
      stat(r.subs.length,'作业数'), stat(r.avg==null?'—':r.avg.toFixed(0)+'%','平均正确率')
    ])) +
    card('🚀 家长服务', '<div class="row">'+btn('学习报告','#/parent/report')+btn('错题与辅导重点','#/parent/wrong')+btn('AI家庭辅导建议','#/parent/advice')+'</div>')+
    card('📋 最近作业', r.subs.slice(-4).reverse().map(function(s){ return '<div class="list-item"><div style="flex:1"><b>'+s.score+'分</b><div class="muted">'+UI.fmtDate(s.submittedAt)+'</div></div><span class="pill '+(s.status==='reviewed'?'ok':'warn')+'">'+(s.status==='reviewed'?'已复核':'待复核')+'</span></div>'; }).join('')||'<p class="muted">暂无作业</p>');
    return set(html);
  }

  function reportView(stu){
    var r=AI.studentReport(stu.id);
    var subs=r.subs.slice(-8).reverse().map(function(s){ return '<tr><td>'+UI.fmtDate(s.submittedAt)+'</td><td><b>'+s.score+'</b></td><td>'+(s.status==='reviewed'?'已复核':'待复核')+'</td></tr>'; }).join('');
    var html=card('📊 '+stu.name+' 学习报告',
      grid4([stat(r.points,'积分'),stat(r.wrongCount,'错题'),stat(r.subs.length,'作业'),stat(r.avg==null?'—':r.avg.toFixed(0)+'%','平均正确率')]) )+
      card('作业记录', '<table><thead><tr><th>时间</th><th>得分</th><th>状态</th></tr></thead><tbody>'+(subs||'<tr><td colspan=3>暂无</td></tr>')+'</tbody></table>')+
      '<div class="row no-print"><button class="btn btn-primary" onclick="window.print()">🖨️ 下载/打印报告</button></div>';
    return set(html);
  }

  function wrongView(stu){
    var db=DB.get(); var wbs=db.wrongBook.filter(function(w){return w.studentId===stu.id;});
    if(!wbs.length) return set(card('📒 错题同步','<p class="muted">孩子暂时没有错题记录。</p>'));
    var rows=wbs.map(function(w){ var q=AI.findQ(w.hwId,w.qid); var stem=q?q.stem:'（原题已归档）';
      return '<div class="q"><div class="q-meta"><span class="pill err">'+UI.esc(w.errorType)+'</span><span class="muted">'+UI.fmtDate(w.lastAt)+'</span></div>'+
        '<div>'+UI.esc(stem)+' <span class="muted">(答案：'+(q?q.answer:'')+')</span></div>'+
        '<div class="muted" style="margin-top:4px">错因：'+UI.esc(w.reason||'—')+'</div>'+
        '<div style="margin-top:6px">辅导重点：<input id="focus-'+w.id+'" value="'+UI.esc(w.parentFocus||'')+'" placeholder="标注需在家重点辅导的内容"><button class="btn btn-sm btn-primary" id="fs-'+w.id+'">保存</button></div>'+
        (global.Analysis?('<div class="row" style="margin-top:6px">'+Analysis.toggleHTML(w)+'</div>'):'')+
        '</div>';
    }).join('');
    var html=card('📒 错题同步与辅导重点（'+wbs.length+'道）', rows);
    return set(html, function(){
      wbs.forEach(function(w){ var b=document.getElementById('fs-'+w.id); if(b) b.onclick=function(){ var db2=DB.get(); var e=DB.byId(db2.wrongBook,w.id); e.parentFocus=document.getElementById('focus-'+w.id).value; DB.save(db2); UI.toast('已保存辅导重点'); };
      });
    });
  }

  function advice(stu){
    var db=DB.get(); var wbs=db.wrongBook.filter(function(w){return w.studentId===stu.id;});
    var errMap={}; wbs.forEach(function(w){ errMap[w.errorType]=(errMap[w.errorType]||0)+1; });
    var tips=[];
    tips.push('【整体】'+stu.name+'目前积分 '+stu.points+'，平均正确率 '+(AI.studentReport(stu.id).avg==null?'—':AI.studentReport(stu.id).avg.toFixed(0)+'%')+'。请多给予鼓励，肯定每一点进步。');
    Object.keys(errMap).forEach(function(t){ tips.push(familyTip(t, errMap[t])); });
    if(!wbs.length) tips.push('孩子近期错题很少，表现优秀！可引导其尝试更有挑战的拓展题，保持学习兴趣。');
    tips.push('【习惯】每天花10分钟，用“数学的眼光”观察生活（如购物算账、看时间、量长度），鼓励孩子用“数学的语言”讲给你听。');
    var html=card('🤖 AI 家庭辅导建议 · '+stu.name,
      '<div class="card" style="background:var(--theme-bg)">'+tips.map(function(t){return '<p style="margin:8px 0">'+UI.esc(t)+'</p>';}).join('')+'</div>'+
      '<div class="row no-print"><button class="btn btn-primary" onclick="window.print()">🖨️ 打印建议</button></div>');
    return set(html);
  }
  function familyTip(type,n){
    var m={
      '计算错误':'孩子出现'+n+'次“计算错误”，多因粗心或进位退位不熟。在家可每天做2道竖式，要求先估算再计算、算完验算。',
      '单位错误':'出现'+n+'次“单位错误”。提醒孩子读题圈出单位，答案后务必带上单位（如厘米、平方厘米）。',
      '审题错误':'出现'+n+'次“审题错误”。培养“读两遍题、划关键条件”的习惯，先说“求什么”再动笔。',
      '概念错误':'出现'+n+'次“概念错误”。建议回看课本对应例题，用实物/画图帮助理解，而非死记步骤。'
    };
    return m[type]||('孩子存在'+n+'次“'+type+'”，建议针对性巩固。');
  }

  /* 工具 */
  function set(html, after){ var v=document.getElementById('view'); v.innerHTML=html; if(after) after(); return html; }
  function card(t,b){ return '<div class="card"><h3>'+t+'</h3>'+b+'</div>'; }
  function grid4(a){ return '<div class="grid grid-4">'+a.join('')+'</div>'; }
  function stat(n,l){ return '<div class="stat"><div class="num">'+n+'</div><div class="lbl">'+l+'</div></div>'; }
  function btn(t,h){ return '<a class="btn btn-primary" href="'+h+'">'+t+'</a>'; }
  function esc(s){ return UI.esc(s); }

  global.Parent={ render:render };
})(window);
