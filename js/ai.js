/* =========================================================
 * ai.js —— AI 引擎（可替换的模拟实现，便于将来接入真实大模型/ OCR 接口）
 * 提供：作业批改、错误识别、变式题生成、讲解、教学建议、学情分析、语音播报
 * ========================================================= */
(function (global) {
  'use strict';

  function norm(s){ return (s==null?'':String(s)).toString().replace(/\s/g,''); }
  function num(s){ var m=norm(s).match(/-?\d+(\.\d+)?/); return m?parseFloat(m[0]):NaN; }

  /* 批改单题：返回 {correct, errorType, errorLoc, reason} */
  function gradeQuestion(q, value){
    var ans = norm(q.answer), val = norm(value);
    if(ans==='' || val==='') return { correct:false, errorType:'未完成', errorLoc:'整题', reason:'学生未作答' };
    // 多空填空（逗号分隔）
    if(ans.indexOf(',')>-1){
      var aArr=ans.split(','), vArr=val.split(',');
      var allOk = aArr.length===vArr.length && aArr.every(function(a,i){ return eq(a,vArr[i]); });
      if(allOk) return ok();
      return { correct:false, errorType:'概念错误', errorLoc:'填空', reason:'部分空填写不正确，需巩固概念' };
    }
    if(eq(ans,val)) return ok();
    // 数值题
    var na=num(ans), nv=num(val);
    if(!isNaN(na) && !isNaN(nv)){
      if(Math.abs(na-nv) <= Math.max(1, Math.abs(na)*0.01)){
        return ok();
      }
      // 单位缺失检测
      if(/厘米|米|cm|m|元|平方/.test(ans) && !/厘米|米|cm|m|元|平方/.test(val))
        return { correct:false, errorType:'单位错误', errorLoc:'答案', reason:'计算结果正确，但漏写单位' };
      if(Math.abs(na-nv) <= Math.abs(na)*0.05+1)
        return { correct:false, errorType:'计算错误', errorLoc:'计算过程', reason:'结果接近标准答案，疑似进位/退位或粗心错误' };
      return { correct:false, errorType:'计算错误', errorLoc:'计算过程', reason:'计算结果与标准答案不符，需检查计算步骤' };
    }
    // 文本题
    if(/厘米|米|元|平方|四|一|小时|时/.test(ans))
      return { correct:false, errorType:'审题错误', errorLoc:'答案', reason:'未审清题意或单位/表达不规范' };
    return { correct:false, errorType:'概念错误', errorLoc:'答案', reason:'概念理解有误，建议回看对应知识点' };
  }
  function eq(a,b){ return norm(a)===norm(b) || num(a)===num(b) && !isNaN(num(a)); }
  function ok(){ return { correct:true, errorType:null, errorLoc:null, reason:null }; }

  /* 模拟 OCR：上传图片后返回各题“识别结果”（演示用，真实环境替换为 OCR 服务） */
  function recognize(homework){
    return homework.questions.map(function(q){
      // 演示：约 25% 概率模拟识别偏差
      var wrong = Math.random()<0.25;
      var val = wrong ? ('识别异常-'+q.answer) : q.answer;
      return { qid:q.id, recognized:val, sure:!wrong };
    });
  }

  /* 同类变式题推送 */
  function variant(q){
    var kp = DB.findKP(q.kp);
    if(!kp) return null;
    var m = kp.make();
    return { id:DB.uid('vq'), type:kp.type, kp:kp.name, stem:m.q, answer:String(m.a), options:m.options||null };
  }

  /* 文字讲解 */
  function explain(q, err){
    if(!err || !err.errorType) return '做得很棒！这道'+q.kp+'题答对啦，继续保持～';
    var map = {
      '计算错误':'这道题考查'+q.kp+'。建议先把算式写清楚，一步步算：'+q.stem+' 的正确答案是 '+q.answer+'。注意进位和退位，算完再验算一遍。',
      '单位错误':'结果算对了，但'+q.kp+'题一定要带上单位哦！本题答案应写作“'+q.answer+'”。单位能帮我们看清数量表示什么。',
      '审题错误':'先别急着算，把题目多读两遍：'+q.stem+'。弄清楚“求什么、已知什么”，再动笔。',
      '概念错误':'这道题涉及'+q.kp+'的核心概念。建议回看课本例题，理解“为什么这样做”，而不是只记步骤。',
      '未完成':'这道题还没写哦，试着独立完成，不会的地方可以请老师或家长讲一讲。'
    };
    return map[err.errorType] || ('这道题还需要再练一练：'+q.stem);
  }

  /* 教学建议（教师端） */
  function suggest(kpName, errRate){
    if(errRate>=0.5) return '【'+kpName+'】班级错误率较高（'+(errRate*100).toFixed(0)+'%），建议下节课先用2分钟集体讲评典型错例，再安排分层巩固练习。';
    if(errRate>=0.25) return '【'+kpName+'】部分同学掌握不牢，可在课后练习中加2道同类基础题，并推送AI变式题给薄弱学生。';
    return '【'+kpName+'】整体掌握良好，可布置1道拓展题保持挑战。';
  }

  /* 语音播报 */
  function voice(text){
    if(!('speechSynthesis' in window)){ UI.toast('当前浏览器不支持语音'); return; }
    try{
      window.speechSynthesis.cancel();
      var u = new SpeechSynthesisUtterance(text);
      u.lang='zh-CN'; u.rate=0.95; u.pitch=1.05;
      var voices = window.speechSynthesis.getVoices();
      for(var i=0;i<voices.length;i++){ if(/zh|Chinese/i.test(voices[i].lang)){ u.voice=voices[i]; break; } }
      window.speechSynthesis.speak(u);
    }catch(e){ UI.toast('语音播放失败'); }
  }

  /* 按知识点生成题目（模拟“AI联网生成/按知识点生成”） */
  function genByKP(grade, kpName, count){
    var pool = DB.KP.filter(function(k){ return (!grade||k.grade==grade) && (!kpName||k.name===kpName); });
    if(!pool.length) pool = DB.KP;
    var out=[];
    for(var i=0;i<(count||5);i++){
      var k=pool[i%pool.length];
      var m=k.make();
      out.push({ id:DB.uid('gq'), grade:k.grade, kp:k.name, type:k.type, stem:m.q, answer:String(m.a), options:m.options||null });
    }
    return out;
  }

  /* 班级学情分析 */
  function classAnalytics(classId){
    var db=DB.get();
    var cls=DB.byId(db.classes, classId); if(!cls) return null;
    var subs = db.submissions.filter(function(s){ var h=DB.byId(db.homework,s.hwId); return h && h.classId===classId; });
    // 双重保险取学生：班级 studentIds + 学生记录里的 classId
    var seen={}, students=[];
    (cls.studentIds||[]).forEach(function(id){ if(!seen[id]){ seen[id]=1; var s=DB.byId(db.students,id); if(s) students.push(s); } });
    db.students.forEach(function(s){ if(s.classId===classId && !seen[s.id]){ seen[s.id]=1; students.push(s); } });
    var perStudent = students.map(function(stu){
      var ss = subs.filter(function(s){return s.studentId===stu.id;});
      var avg = ss.length? ss.reduce(function(a,s){return a+s.score;},0)/ss.length : null;
      return { stu:stu, avg:avg, count:ss.length };
    });
    // 高频错误（按知识点）
    var errMap={};
    subs.forEach(function(s){ s.answers.forEach(function(a){ if(!a.correct){ var q=findQ(s.hwId,a.qid); var key=q?q.kp:'未知'; errMap[key]=(errMap[key]||0)+1; } }); });
    var topErrors = Object.keys(errMap).map(function(k){return {kp:k, n:errMap[k]};}).sort(function(a,b){return b.n-a.n;}).slice(0,5);
    return { cls:cls, perStudent:perStudent, topErrors:topErrors, subCount:subs.length };
  }
  function findQ(hwId,qid){ var h=DB.byId(DB.get().homework,hwId); if(!h) return null; return h.questions.find(function(x){return x.id===qid;})||null; }

  /* 学生个人报告 */
  function studentReport(studentId){
    var db=DB.get();
    var stu=DB.byId(db.students,studentId);
    var subs=db.submissions.filter(function(s){return s.studentId===studentId;});
    var avg = subs.length? subs.reduce(function(a,s){return a+s.score;},0)/subs.length : null;
    var wb = db.wrongBook.filter(function(w){return w.studentId===studentId;});
    return { stu:stu, subs:subs, avg:avg, wrongCount:wb.length, points:stu.points };
  }

  global.AI = {
    gradeQuestion:gradeQuestion, recognize:recognize, variant:variant, explain:explain,
    suggest:suggest, voice:voice, genByKP:genByKP, classAnalytics:classAnalytics,
    studentReport:studentReport, findQ:findQ
  };
})(window);
