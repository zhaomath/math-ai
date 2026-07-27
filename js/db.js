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
    var prev = load();                 // 修改前快照：用于判断哪些记录真的变了
    stampChanged(db, prev);            // 只给变化的记录刷新 updatedAt（修复积分被旧数据覆盖）
    try{ localStorage.setItem(KEY, JSON.stringify(db)); }catch(e){}
    return pushToCloud(db); // 后台同步；返回 Promise，关键路径可 await 并提示用户
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

  /* ---------- 云端同步的「按记录合并」（v2.16 修复作业互相覆盖的核心） ----------
   * 旧逻辑把每个集合存成 sync 集合里的单个文档，pushToCloud 用 set 整文档覆盖、
   * syncFromCloud 用 db[name]=d.data 整集合覆盖本地——任一端 save 都会把其它端
   * 的提交整体踩掉，导致"提交后过一会又变未完成、教师/家长端看不到"。
   * 改为：按 id 合并，同 id 取 updatedAt 较新者；本地/云端独有记录都保留。
   * 这样无论哪端先提交，都不会再丢失另一端的数据。 */
  function tsOf(o){ return (o && typeof o.updatedAt==='number') ? o.updatedAt : 0; }
  function mergeArr(local, cloud){
    local = Array.isArray(local) ? local : [];
    cloud = Array.isArray(cloud) ? cloud : [];
    var map = {}, out = [];
    cloud.forEach(function(r){ if(r && r.id) map[r.id] = r; });
    local.forEach(function(r){
      if(!r || !r.id) return;
      var c = map[r.id];
      if(c){
        // 同 id 冲突：云端严格更新则取云端；否则保留本地（本地刚编辑的优先，避免丢刚提交的内容）
        out.push(tsOf(c) > tsOf(r) ? c : r);
        delete map[r.id];
      } else {
        out.push(r); // 本地独有，保留
      }
    });
    Object.keys(map).forEach(function(id){ out.push(map[id]); }); // 云端独有，补入
    return out;
  }
  // 从同步文档里取出数组（兼容 {name,data:[...],ts} 与直接是数组两种形态）
  function extractData(cur){
    try{ var d = cur && cur.data; if(!d) return [];
      if(Array.isArray(d.data)) return d.data;
      if(Array.isArray(d)) return d;
      return [];
    }catch(e){ return []; }
  }
  // v2.22 修复：只给「内容真的变了」的记录刷新 updatedAt。
  // 旧版 stampUpdated 每次 save 都把所有记录刷成最新时间戳，等于每台设备都宣称
  // "我的全部数据最新"，last-writer-wins 仲裁失效——别的设备上的旧积分会反过来
  // 覆盖新积分（积分不同步的根因之一）。
  function stripTs(r){ var c={}; for(var k in r){ if(k!=='updatedAt') c[k]=r[k]; } return JSON.stringify(c); }
  function stampChanged(db, prev){
    var now = Date.now();
    SYNC_NAMES.forEach(function(name){
      var prevMap = {};
      ((prev && prev[name]) || []).forEach(function(r){ if(r && r.id) prevMap[r.id] = r; });
      (db[name] || []).forEach(function(r){
        if(!r || !r.id) return;
        var p = prevMap[r.id];
        if(!p){ if(!r.updatedAt) r.updatedAt = now; return; }          // 新增记录
        if(stripTs(p) !== stripTs(r)) r.updatedAt = now;               // 内容变了才刷新戳
        else if(!r.updatedAt && p.updatedAt) r.updatedAt = p.updatedAt; // 没变则保留原戳
      });
    });
  }
  /* 加积分的唯一入口（v2.22）：同时更新 users（云端同步的权威集合）与 students（本地视图）。
   * 旧代码只写 db.students，而云端只同步 users → 积分永远上不了云、各端不一致。 */
  function addPoints(db, sid, gain){
    var u = byId(db.users || [], sid);
    var s = byId(db.students || [], sid);
    var next = (((u && u.points) != null ? u.points : (s && s.points)) || 0) + gain;
    var now = Date.now();
    if(u){ u.points = next; u.updatedAt = now; }
    if(s && s !== u){ s.points = next; s.updatedAt = now; }
    return next;
  }
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
    // 1.5) 积分自愈（v2.22）：users 是云端同步的权威集合，students 是本地视图，
    // 二者经 JSON 序列化后已是两份拷贝。旧代码只把积分加在 students 上导致上不了云。
    // 积分只增不减 → 同一学生取两边较大值并双向对齐，把丢在本地的积分找回来。
    var stuMap = {};
    db.students.forEach(function(s){ if(s && s.id) stuMap[s.id]=s; });
    db.users.forEach(function(u){
      if(u.role!=='student') return;
      var s = stuMap[u.id];
      if(!s || s===u) return;
      var up = u.points||0, sp = s.points||0;
      if(up !== sp){
        var mx = Math.max(up, sp);
        u.points = mx; s.points = mx;
        u.updatedAt = Date.now(); s.updatedAt = u.updatedAt;
        changed = true;
      }
    });
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

  /* 把云端写入失败的原始报错翻译成可操作的中文（最常见根因：sync 集合权限是"仅创建者可写"，
   * 每台设备匿名身份不同 → 其它设备读得到写不进 → 提交作业永远上不了云） */
  function friendlyWriteErr(e){
    var raw = ((e && (e.message || e.errMsg || e.error || '')) + ' ' + (e && e.code ? String(e.code) : '')).toLowerCase();
    if(/permission|denied|unauthorized|鉴权|无权限|access denied|not authorized|write.*forbid|forbidden|database_permission/.test(raw))
      return '云端拒绝写入（权限不足）：请在 CloudBase 控制台把 sync 集合权限改为「所有用户可读写」或安全规则 {"read":"auth!=null","write":"auth!=null"}。当前很可能是"仅创建者可写"，导致其它设备写不进。';
    if(/network|timeout|超时|econn|offline|disconnected|fetch/.test(raw))
      return '网络异常，云端写入失败，请检查网络后点 🔄 同步重试。';
    if(/duplicate|e11000|dup key/.test(raw))
      return '云端写入被拒绝：当前设备没有「更新已有文档」的权限（仅能创建新文档）。请在 CloudBase 控制台把 sync 集合权限改成「所有用户可读写」，并确认修改后点击「应用/保存」。';
    return '云端写入失败：' + ((e && (e.message || e.errMsg)) || '未知原因');
  }

  /* ---------- 云端同步 ---------- */
  // 上传：把需同步的集合整体写成云端集合里的独立文档（每次 save 约 5 次调用，极省额度）
  // 返回 { ok:true/false, details:{name:boolean} }
  async function pushToCloud(db){
    if(!global.CB || !CB.enabled) return {ok:false, details:{}};
    var result = {ok:true, details:{}};
    try{
      // 时间戳已在 save() 里按「内容是否变化」精准打好，这里不再全量刷新（v2.22）
      var c = CB.coll(SYNC_COLL);
      for(var i=0;i<SYNC_NAMES.length;i++){
        var name = SYNC_NAMES[i];
        var data = db[name];
        if(!Array.isArray(data)) continue;
        try{
          var cur = await c.doc(name).get();           // 先读云端当前值
          var cloudData = extractData(cur);
          var merged = mergeArr(data, cloudData);       // 按记录合并：保留其它端的提交，补入本地新提交
          await c.doc(name).set({ name:name, data:merged, ts:Date.now() });
          db[name] = merged;                            // 把合并结果回填内存，保持一致
          result.details[name]=true;
        }catch(e){
          // 读云端失败时，宁可本次不上传该集合，也绝不用本地数据直接覆盖云端，
          // 否则可能把其它设备已同步的数据整体清空（这是本次 bug 的核心原因之一）。
          result.details[name]=false; result.ok=false;
          result.errMsg = friendlyWriteErr(e);          // 记录真实原因，供 UI 展示
          result.rawErr = (e && (e.message || e.errMsg || String(e))) || '';
          console.warn('[CloudBase] 同步集合「'+name+'」写入失败：', e && e.message, e);
        }
      }
      if(!result.ok) CB.syncError = result.errMsg || '部分数据未同步到云端，请检查网络后重试';
      return result;
    }catch(e){ if(global.CB) CB.syncError=(e&&e.message)||'上传失败'; console.warn('[CloudBase] 同步上传失败：', e && e.message); return {ok:false, details:{}}; }
  }
  // 下载：启动时 / 定时拉取云端快照，与本地按记录合并（不再整集合覆盖，避免踩掉刚提交的内容）
  // opts.force=true 表示强制以云端为准，丢弃本地对同步集合的修改（用于紧急恢复被本地错误数据覆盖的情况）
  // 返回 { ok, changed }
  async function syncFromCloud(opts){
    opts = opts || {};
    if(!global.CB || !CB.enabled) return {ok:false, changed:false};
    try{
      var c = CB.coll(SYNC_COLL);
      var res = await c.get();
      var docs = (res && res.data) || [];
      var db = load() || emptyDb();
      var before = localStorage.getItem(KEY);            // 合并前快照，用于判断是否有变化
      docs.forEach(function(d){
        if(d && SYNC_NAMES.indexOf(d.name)>=0 && Array.isArray(d.data)){
          if(opts.force){
            db[d.name] = d.data;                         // 强制以云端为准
          } else {
            db[d.name] = mergeArr(db[d.name], d.data);   // 云端 → 本地 按记录合并（本地未同步的新提交不丢）
          }
        }
      });
      var normalizeChanged = normalize(db);            // 以 users 为权威源补齐 students / parents
      var after = JSON.stringify(db);
      var changed = (after !== before) || normalizeChanged;
      if(changed) localStorage.setItem(KEY, after);     // 仅在真有变化时写回，避免无谓写入与无限重绘
      if(normalizeChanged) pushToCloud(db);             // 把补齐后的数据回写云端，保证各端一致
      CB._lastSyncAt = Date.now();
      localStorage.setItem(KEY+'_last_sync', String(CB._lastSyncAt));
      return {ok:true, changed:changed};
    }catch(e){ if(global.CB) CB.syncError=(e&&e.message)||'下载失败'; console.warn('[CloudBase] 同步下载失败：', e && e.message); return {ok:false, changed:false}; }
  }
  // 强制以云端为准拉取一次（丢弃本地对同步集合的修改），用于修复本地错误数据顽固覆盖云端的问题
  async function forcePullFromCloud(){
    return syncFromCloud({force:true});
  }
  // 云端写入自检：分别测试「创建新文档」和「更新已有文档」两种权限
  // sync 集合的核心同步需要 update 已有文档，若仅允许 create 会出现 duplicate key 错误。
  // 返回 { ok, msg }——用于一键定位"仅创建者可写"这类权限问题
  async function testCloudWrite(){
    if(!global.CB || !CB.enabled) return {ok:false, msg:'当前是本机模式，未连接云端'};
    var c = CB.coll(SYNC_COLL);
    var testId = '_writetest_' + Date.now();
    try{
      // 1) 测试 create 权限：新建一个随机 id 的测试文档
      await c.doc(testId).set({ name:testId, ts:Date.now(), by:'self-check' });
      // 2) 测试 update 权限：更新这个刚创建的文档
      try{
        await c.doc(testId).set({ name:testId, ts:Date.now(), by:'self-check', updated:true });
        return {ok:true, msg:'本设备可正常创建并更新云端文档'};
      }catch(e2){
        return {ok:false, msg:'可创建新文档，但无法更新已有文档：' + friendlyWriteErr(e2) + '（sync 集合权限未放开 update）'};
      }
    }catch(e){
      return {ok:false, msg:'无法创建云端文档：' + friendlyWriteErr(e)};
    }
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
    syncFromCloud:syncFromCloud, pushToCloud:pushToCloud, forcePullFromCloud:forcePullFromCloud, testCloudWrite:testCloudWrite,
    getSession:getSession, setSession:setSession, clearSession:clearSession,
    uid:uid, byId:byId, byPhone:byPhone, rand:rand, fix:fix, findKP:findKP, addPoints:addPoints,
    SYNC_COLL:SYNC_COLL, SYNC_NAMES:SYNC_NAMES
  };
})(window);
