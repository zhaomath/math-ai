/* =========================================================
 * db.js —— 数据层
 *  - 本地：localStorage 持久化（同步语义不变，三端 UI / ai.js 无需改动）
 *  - 云端：启用 CloudBase 时，save 触发后台「集合级整体快照」同步，
 *          启动 init 时从云端拉取合并。本地始终是快取，断网可用。
 * 同步集合：users / classes / homework / submissions / wrongBook
 * （questionBank 由前端 KP 在前端生成，不纳入云端同步）
 * ========================================================= */
(function (global) {
  'use strict';
  var KEY = 'mathai_db_v1';
  var SKEY = 'mathai_session_v1';

  // 云端同步配置
  var SYNC_COLL = 'sync';                       // 云端集合名
  var SYNC_NAMES = ['users','classes','homework','submissions','wrongBook'];

  /* ---------- 苏教版 1-6 年级知识点与出题模板 ---------- */
  var KP = [
    { grade:1, name:'20以内加减法', type:'口算', make:function(){ var a=rand(1,18),b=rand(1,19-a); return {q:a+'+'+b+'=', a:(a+b)}; } },
    { grade:1, name:'认识钟表', type:'填空', make:function(){ var h=rand(1,12); return {q:'分针指向12，时针指向'+h+'，是____时。', a:h}; } },
    { grade:1, name:'认识人民币', type:'填空', make:function(){ var n=rand(1,9); return {q:n+'张1元等于____元。', a:n}; } },
    { grade:2, name:'表内乘法', type:'口算', make:function(){ var a=rand(2,9),b=rand(2,9); return {q:a+'×'+b+'=', a:(a*b)}; } },
    { grade:2, name:'表内除法', type:'口算', make:function(){ var b=rand(2,9),a=rand(2,9); return {q:(a*b)+'÷'+b+'=', a:a}; } },
    { grade:2, name:'长度单位', type:'填空', make:function(){ var n=rand(1,9); return {q:'一支铅笔长约'+n+'（厘米/米），选：____。', a:'厘米', options:['厘米','米']}; } },
    { grade:3, name:'两三位数乘一位数', type:'竖式', make:function(){ var a=rand(12,999),b=rand(2,9); return {q:a+'×'+b, a:(a*b)}; } },
    { grade:3, name:'长方形正方形面积', type:'应用题', make:function(){ var w=rand(3,12),h=rand(3,12); return {q:'一个长方形长'+w+'厘米、宽'+h+'厘米，面积是多少平方厘米？', a:(w*h)}; } },
    { grade:3, name:'分数初步认识', type:'填空', make:function(){ return {q:'把一个蛋糕平均分成4份，每份是它的____分之____。', a:'四,一'}; } },
    { grade:4, name:'大数的认识', type:'填空', make:function(){ var n=rand(1000,9999); return {q:n+'里有____个千和____个一。', a:Math.floor(n/1000)+','+(n%1000)}; } },
    { grade:4, name:'运算律', type:'口算', make:function(){ var a=rand(11,89),b=rand(11,89); return {q:'('+a+'+'+b+')+'+a+'=', a:(2*a+b)}; } },
    { grade:4, name:'小数加减法', type:'竖式', make:function(){ var a=fix(rand(1,9)+Math.random()),b=fix(rand(1,9)+Math.random()); return {q:a+'+'+b, a:fix(a+b)}; } },
    { grade:5, name:'小数乘除法', type:'竖式', make:function(){ var a=fix(rand(1,9)+Math.random()),b=rand(2,9); return {q:a+'×'+b, a:fix(a*b)}; } },
    { grade:5, name:'多边形面积', type:'应用题', make:function(){ var b=rand(4,15),h=rand(3,12); return {q:'平行四边形底'+b+'cm、高'+h+'cm，面积是____cm²。', a:(b*h)}; } },
    { grade:5, name:'因数与倍数', type:'填空', make:function(){ var n=rand(2,9)*2; return {q:'写出'+n+'的两个因数：____、____。', a:'1,'+n}; } },
    { grade:6, name:'分数乘除', type:'口算', make:function(){ var a=rand(2,9); return {q:a+'×1/'+a+'=', a:1}; } },
    { grade:6, name:'圆的周长面积', type:'应用题', make:function(){ var r=rand(2,10); return {q:'一个圆半径'+r+'cm（π取3.14），面积是____cm²。', a:fix(3.14*r*r)}; } },
    { grade:6, name:'百分数', type:'填空', make:function(){ var n=rand(1,9)*10; return {q:n+'是50的____%。', a:(n*2)}; } }
  ];

  function rand(a,b){ return Math.floor(Math.random()*(b-a+1))+a; }
  function fix(n){ return Math.round(n*100)/100; }

  /* ---------- 读取 / 保存 ---------- */
  function load(){
    try{ var s=localStorage.getItem(KEY); return s?JSON.parse(s):null; }catch(e){ return null; }
  }
  function save(db){
    try{ localStorage.setItem(KEY, JSON.stringify(db)); }catch(e){}
    pushToCloud(db); // 后台同步，不阻塞 UI
  }
  function get(){
    var db = load();
    if(db){ normalize(db); return db; }
    // 云端模式：本地为空时给空壳（等 syncFromCloud 拉取），不自动生成演示数据以免污染共享库
    if(global.CB && CB.enabled){
      return emptyDb();
    }
    db = seed(); save(db); return db; // 本地模式：首次生成演示数据
  }
  function reset(){ localStorage.removeItem(KEY); return get(); }

  function emptyDb(){
    return { users:[], classes:[], students:[], parents:[], homework:[], submissions:[],
             questionBank: buildQuestionBank(), wrongBook:[] };
  }

  function getSession(){ try{ return JSON.parse(localStorage.getItem(SKEY)); }catch(e){ return null; } }
  function setSession(u){ localStorage.setItem(SKEY, JSON.stringify({uid:u.id, role:u.role})); }
  function clearSession(){ localStorage.removeItem(SKEY); }

  /* ---------- 工具 ---------- */
  function uid(p){ return (p||'id')+'_'+Date.now().toString(36)+Math.random().toString(36).slice(2,6); }
  function byId(arr,id){ for(var i=0;i<arr.length;i++) if(arr[i].id===id) return arr[i]; return null; }
  function byPhone(arr,phone){ for(var i=0;i<arr.length;i++) if(arr[i].phone===phone) return arr[i]; return null; }
  function uniqById(arr){ var m={}, r=[]; (arr||[]).forEach(function(x){ if(x && x.id && !m[x.id]){ m[x.id]=1; r.push(x); } }); return r; }
  /* 数据自修复：students / parents / class.studentIds 在跨设备拉取后可能不一致，
   * 而 users 是唯一完整同步的集合。这里以 users 为权威源补齐 students/parents，
   * 再以 students 为源补齐每个班级的 studentIds，保证概览、班级管理、学情分析一致。
   * 返回 true 表示发生了补齐（需要回写云端）。 */
  function normalize(db){
    if(!db || !Array.isArray(db.users)) return false;
    db.students = db.students || [];
    db.parents = db.parents || [];
    db.classes = db.classes || [];
    var have = {};
    db.students.concat(db.parents).forEach(function(x){ if(x && x.id) have[x.id]=1; });
    var changed = false;
    // 1) 从 users 补齐 students / parents
    db.users.forEach(function(u){
      if((u.role==='student' || u.role==='parent') && !have[u.id]){
        if(u.role==='student') db.students.push(u); else db.parents.push(u);
        have[u.id]=1; changed=true;
      }
    });
    db.students = uniqById(db.students);
    db.parents = uniqById(db.parents);
    // 2) 从 students 补齐 class.studentIds（概览/班级管理依赖它）
    var stuByClass = {};
    db.students.forEach(function(s){ if(s && s.classId){ stuByClass[s.classId]=stuByClass[s.classId]||[]; stuByClass[s.classId].push(s.id); } });
    db.classes.forEach(function(c){
      if(!c) return;
      var ids = stuByClass[c.id] || [];
      var set = {};
      (c.studentIds||[]).forEach(function(id){ set[id]=1; });
      ids.forEach(function(id){ if(!set[id]){ (c.studentIds||(c.studentIds=[])).push(id); set[id]=1; changed=true; } });
    });
    return changed;
  }

  /* ---------- 云端同步 ---------- */
  // 上传：把需同步的集合整体写成云端集合里的独立文档（每次 save 约 5 次调用，极省额度）
  async function pushToCloud(db){
    if(!global.CB || !CB.enabled) return;
    try{
      var c = CB.coll(SYNC_COLL);
      for(var i=0;i<SYNC_NAMES.length;i++){
        var name = SYNC_NAMES[i];
        var data = db[name];
        if(!Array.isArray(data)) continue;
        await c.doc(name).set({ name:name, data:data, ts:Date.now() });
      }
    }catch(e){ if(global.CB) CB.syncError=(e&&e.message)||'上传失败'; console.warn('[CloudBase] 同步上传失败：', e && e.message); }
  }
  // 下载：启动时拉取云端快照，合并进本地（覆盖本地全量，以云端为准）
  async function syncFromCloud(){
    if(!global.CB || !CB.enabled) return false;
    try{
      var c = CB.coll(SYNC_COLL);
      var res = await c.get();
      var docs = (res && res.data) || [];
      var db = load() || emptyDb();
      docs.forEach(function(d){
        if(d && SYNC_NAMES.indexOf(d.name)>=0 && Array.isArray(d.data)) db[d.name] = d.data;
      });
      var changed = normalize(db);   // 以 users 为权威源补齐 students / parents
      localStorage.setItem(KEY, JSON.stringify(db));
      if(changed) pushToCloud(db);   // 把补齐后的数据回写云端，保证各端一致
      return true;
    }catch(e){ if(global.CB) CB.syncError=(e&&e.message)||'下载失败'; console.warn('[CloudBase] 同步下载失败：', e && e.message); return false; }
  }

  /* ---------- 知识点题库（前端生成，不云端同步） ---------- */
  function buildQuestionBank(){
    var qb=[];
    KP.forEach(function(k){
      for(var i=0;i<2;i++){
        var m=k.make();
        qb.push({ id:uid('q'), grade:k.grade, kp:k.name, type:k.type,
          stem:m.q, answer:String(m.a), options:m.options||null });
      }
    });
    return qb;
  }

  /* ---------- 种子数据（仅本地模式首次使用） ---------- */
  function seed(){
    var users=[], classes=[], students=[], parents=[], homework=[], submissions=[], questionBank=[], wrongBook=[];

    var t={ id:'t1', role:'teacher', phone:'13800000001', pwd:'123456', name:'赵老师', school:'紫琅第一小学' };
    users.push(t);

    var c={ id:'c1', name:'三(1)班', grade:3, teacherId:'t1', school:'紫琅第一小学' };
    classes.push(c);

    questionBank = buildQuestionBank();

    var names=['王小明','李小红','张小刚','刘小丽','陈小强'];
    for(var i=0;i<5;i++){
      var sPhone='138000000'+(11+i);
      var pPhone='138000000'+(21+i);
      var stu={ id:'s'+(i+1), role:'student', phone:sPhone, pwd:'123456', name:names[i],
        studentNo:'20230'+(i+1), classId:'c1', parentId:'p'+(i+1), points:rand(20,120), grade:3 };
      var par={ id:'p'+(i+1), role:'parent', phone:pPhone, pwd:'123456', name:names[i].slice(0,1)+'家长',
        studentId:'s'+(i+1) };
      users.push(stu); users.push(par);
      students.push(stu); parents.push(par);
      c.studentIds = c.studentIds||[]; c.studentIds.push(stu.id);
    }

    var hwQuestions=[];
    var pick=[ findKP('两三位数乘一位数'), findKP('长方形正方形面积'), findKP('分数初步认识') ];
    pick.forEach(function(k){
      var m=k.make();
      hwQuestions.push({ id:uid('hq'), type:k.type, kp:k.name, stem:m.q, answer:String(m.a), options:m.options||null, tier:'base' });
    });
    var hw2=findKP('运算律'); var m2=hw2.make();
    hwQuestions.push({ id:uid('hq'), type:hw2.type, kp:hw2.name, stem:m2.q, answer:String(m2.a), tier:'extend' });

    var hw={ id:'hw1', classId:'c1', title:'第三单元·分层练习', grade:3, publishedAt:Date.now()-86400000*2,
      status:'published', questions:hwQuestions };
    homework.push(hw);

    var subStudents=['s1','s2','s3'];
    var sampleWrong=[ {qid:hwQuestions[0].id, errorType:'计算错误', errorLoc:'进位', reason:'乘法进位忘记加'},
                     {qid:hwQuestions[1].id, errorType:'单位错误', errorLoc:'答案', reason:'忘记写面积单位'} ];
    subStudents.forEach(function(sid,idx){
      var answers=hwQuestions.map(function(q,i){
        var wrong = idx===0 && i<sampleWrong.length && sampleWrong[i].qid===q.id;
        if(wrong){ var sw=sampleWrong[i];
          return { qid:q.id, value:'错误示例', correct:false, errorType:sw.errorType, errorLoc:sw.errorLoc, reason:sw.reason };
        }
        return { qid:q.id, value:q.answer, correct:true, errorType:null, errorLoc:null, reason:null };
      });
      var score=answers.filter(function(a){return a.correct;}).length/hwQuestions.length*100;
      submissions.push({ id:uid('sub'), hwId:'hw1', studentId:sid, answers:answers, score:Math.round(score),
        aiGraded:true, teacherReviewed: idx===0, status:'reviewed', submittedAt:Date.now()-86400000*(2-idx) });
      answers.filter(function(a){return !a.correct;}).forEach(function(a){
        wrongBook.push({ id:uid('w'), studentId:sid, qid:a.qid, hwId:'hw1', type:'作业',
          errorType:a.errorType, reason:a.reason, times:1, lastAt:Date.now(), variants:[] });
      });
    });

    return { users:users, classes:classes, students:students, parents:parents,
      homework:homework, submissions:submissions, questionBank:questionBank, wrongBook:wrongBook };
  }

  function findKP(name){ for(var i=0;i<KP.length;i++) if(KP[i].name===name) return KP[i]; return KP[0]; }

  global.DB = {
    KEY:KEY, KP:KP,
    get:get, save:save, reset:reset, seed:seed, emptyDb:emptyDb,
    syncFromCloud:syncFromCloud, pushToCloud:pushToCloud,
    getSession:getSession, setSession:setSession, clearSession:clearSession,
    uid:uid, byId:byId, byPhone:byPhone, rand:rand, fix:fix, findKP:findKP,
    SYNC_COLL:SYNC_COLL, SYNC_NAMES:SYNC_NAMES
  };
})(window);
