/* =========================================================
 * db.js —— 数据层（localStorage 持久化）+ 苏教版知识点体系 + 种子数据
 * 全部数据存于 localStorage，三端（教师/学生/家长）共享同一库，实现协同闭环。
 * ========================================================= */
(function (global) {
  'use strict';
  var KEY = 'mathai_db_v1';
  var SKEY = 'mathai_session_v1';

  /* ---------- 苏教版 1-6 年级知识点与出题模板 ---------- */
  // make() 返回 {q:题干, a:标准答案, options?} ；出题引擎在 ai.js 中调用
  var KP = [
    // 一年级
    { grade:1, name:'20以内加减法', type:'口算', make:function(){ var a=rand(1,18),b=rand(1,19-a); return {q:a+'+'+b+'=', a:(a+b)}; } },
    { grade:1, name:'认识钟表', type:'填空', make:function(){ var h=rand(1,12); return {q:'分针指向12，时针指向'+h+'，是____时。', a:h}; } },
    { grade:1, name:'认识人民币', type:'填空', make:function(){ var n=rand(1,9); return {q:n+'张1元等于____元。', a:n}; } },
    // 二年级
    { grade:2, name:'表内乘法', type:'口算', make:function(){ var a=rand(2,9),b=rand(2,9); return {q:a+'×'+b+'=', a:(a*b)}; } },
    { grade:2, name:'表内除法', type:'口算', make:function(){ var b=rand(2,9),a=rand(2,9); return {q:(a*b)+'÷'+b+'=', a:a}; } },
    { grade:2, name:'长度单位', type:'填空', make:function(){ var n=rand(1,9); return {q:'一支铅笔长约'+n+'（厘米/米），选：____。', a:'厘米', options:['厘米','米']}; } },
    // 三年级
    { grade:3, name:'两三位数乘一位数', type:'竖式', make:function(){ var a=rand(12,999),b=rand(2,9); return {q:a+'×'+b, a:(a*b)}; } },
    { grade:3, name:'长方形正方形面积', type:'应用题', make:function(){ var w=rand(3,12),h=rand(3,12); return {q:'一个长方形长'+w+'厘米、宽'+h+'厘米，面积是多少平方厘米？', a:(w*h)}; } },
    { grade:3, name:'分数初步认识', type:'填空', make:function(){ return {q:'把一个蛋糕平均分成4份，每份是它的____分之____。', a:'四,一'}; } },
    // 四年级
    { grade:4, name:'大数的认识', type:'填空', make:function(){ var n=rand(1000,9999); return {q:n+'里有____个千和____个一。', a:Math.floor(n/1000)+','+(n%1000)}; } },
    { grade:4, name:'运算律', type:'口算', make:function(){ var a=rand(11,89),b=rand(11,89); return {q:'('+a+'+'+b+')+'+a+'=', a:(2*a+b)}; } },
    { grade:4, name:'小数加减法', type:'竖式', make:function(){ var a=fix(rand(1,9)+Math.random()),b=fix(rand(1,9)+Math.random()); return {q:a+'+'+b, a:fix(a+b)}; } },
    // 五年级
    { grade:5, name:'小数乘除法', type:'竖式', make:function(){ var a=fix(rand(1,9)+Math.random()),b=rand(2,9); return {q:a+'×'+b, a:fix(a*b)}; } },
    { grade:5, name:'多边形面积', type:'应用题', make:function(){ var b=rand(4,15),h=rand(3,12); return {q:'平行四边形底'+b+'cm、高'+h+'cm，面积是____cm²。', a:(b*h)}; } },
    { grade:5, name:'因数与倍数', type:'填空', make:function(){ var n=rand(2,9)*2; return {q:'写出'+n+'的两个因数：____、____。', a:'1,'+n}; } },
    // 六年级
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
  function save(db){ localStorage.setItem(KEY, JSON.stringify(db)); }
  function get(){ var db=load(); if(!db){ db=seed(); save(db); } return db; }
  function reset(){ localStorage.removeItem(KEY); return get(); }

  function getSession(){ try{ return JSON.parse(localStorage.getItem(SKEY)); }catch(e){ return null; } }
  function setSession(u){ localStorage.setItem(SKEY, JSON.stringify({uid:u.id, role:u.role})); }
  function clearSession(){ localStorage.removeItem(SKEY); }

  /* ---------- 工具 ---------- */
  function uid(p){ return (p||'id')+'_'+Date.now().toString(36)+Math.random().toString(36).slice(2,6); }
  function byId(arr,id){ for(var i=0;i<arr.length;i++) if(arr[i].id===id) return arr[i]; return null; }
  function byPhone(arr,phone){ for(var i=0;i<arr.length;i++) if(arr[i].phone===phone) return arr[i]; return null; }

  /* ---------- 种子数据 ---------- */
  function seed(){
    var users=[], classes=[], students=[], parents=[], homework=[], submissions=[], questionBank=[], wrongBook=[];

    // 教师
    var t={ id:'t1', role:'teacher', phone:'13800000001', pwd:'123456', name:'赵老师', school:'紫琅第一小学' };
    users.push(t);

    // 班级
    var c={ id:'c1', name:'三(1)班', grade:3, teacherId:'t1', school:'紫琅第一小学' };
    classes.push(c);

    // 知识点题库（取 KP 每项生成示例）
    KP.forEach(function(k){
      for(var i=0;i<2;i++){
        var m=k.make();
        questionBank.push({ id:uid('q'), grade:k.grade, kp:k.name, type:k.type,
          stem:m.q, answer:String(m.a), options:m.options||null });
      }
    });

    // 学生 + 家长
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

    // 一份已发布的分层作业
    var hwQuestions=[];
    var pick=[
      findKP('两三位数乘一位数'), findKP('长方形正方形面积'), findKP('分数初步认识')
    ];
    pick.forEach(function(k){
      var m=k.make();
      hwQuestions.push({ id:uid('hq'), type:k.type, kp:k.name, stem:m.q, answer:String(m.a), options:m.options||null, tier:'base' });
    });
    var hw2=findKP('运算律'); var m2=hw2.make();
    hwQuestions.push({ id:uid('hq'), type:hw2.type, kp:hw2.name, stem:m2.q, answer:String(m2.a), tier:'extend' });

    var hw={ id:'hw1', classId:'c1', title:'第三单元·分层练习', grade:3, publishedAt:Date.now()-86400000*2,
      status:'published', questions:hwQuestions };
    homework.push(hw);

    // 模拟几份提交与批改
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
      // 错题库
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
    get:get, save:save, reset:reset, seed:seed,
    getSession:getSession, setSession:setSession, clearSession:clearSession,
    uid:uid, byId:byId, byPhone:byPhone, rand:rand, fix:fix, findKP:findKP
  };
})(window);
