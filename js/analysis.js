/* =========================================================
 * analysis.js —— 错题文字解析引擎（移动端纯文字方案，替代语音讲解）
 *
 * 设计要点（与现有数据接口对接）：
 *  1) 解析是「错题记录(wrongBook)的派生数据」，结构化后写回 wrongBook 记录的
 *     analysis 字段，随 DB.save() → CloudBase 同步管线"从后端动态加载"，
 *     三端(学生/家长/教师)打开同一道错题时拿到的是同一份解析，无需新增服务端。
 *  2) 按题型(选择/填空/判断/竖式/口算/应用题)自适应解析的「深度与结构」：
 *     判断/选择侧重概念辨析与排除；填空/竖式/口算侧重步骤与进位退位；
 *     应用题侧重"读-找-列-算-答"数量关系。
 *  3) 解析内容含三大模块：错误原因分析 / 正确解题思路(含步骤) / 相关知识点关联，
 *     并附「防错小提示」。知识点来自 KP_INFO 知识库，做到"针对性"而非套话。
 *  4) 前端交互：整段解析可折叠展开；字号 A- / A / A+ 缩放(持久化)；
 *     用原生 <details> 实现各小节折叠，移动端友好、零依赖。
 *
 * 暴露：global.Analysis = { build, load, cardHTML, modal, init }
 * ========================================================= */
(function (global) {
  'use strict';

  /* ---------- 知识点库：让解析"有针对性"而非笼统 ----------
   * 每个知识点给出：knowledge 关联知识点、causes 按错误类型的具体原因、
   * rel 应用题数量关系、method 填空/计算的解法提示、task 任务描述、calc 计算注意点。 */
  var KP_INFO = {
    '20以内加减法': {
      knowledge:['加减法意义：把两部分合起来用加法，从总数里去掉一部分用减法。','凑十法：看大数、分小数，凑成十再算。','验算：用"和-一个加数=另一个加数"检查。'],
      causes:{ '计算错误':'个位相加满十忘记向十位进一，或退位时少减了。','审题错误':'没看清"一共"用加还是"还剩"用减。','概念错误':'对加减法的实际意义不理解，凭感觉写数。' },
      task:'算出正确的得数', method:'用凑十法或数数法一步步算', calc:'进位与退位'
    },
    '认识钟表': {
      knowledge:['钟面有12个大格，分针走一圈是60分，时针走一大格是1时。','整时：分针指向12，时针指向几就是几时。','半时：分针指向6，时针走过几就是几时半。'],
      causes:{ '概念错误':'把时针和分针看反，或分不清"几时"与"几时半"。','审题错误':'题目要求写"时"，却写了分钟数。' },
      task:'读出或写出正确的时刻', method:'先看分针定"分"，再看时针定"时"', calc:'时针/分针区分'
    },
    '认识人民币': {
      knowledge:['人民币单位：元、角、分，1元=10角，1角=10分。','几张1元就是几元；几张1角就是几角。','购物时"一共多少钱"用加法。'],
      causes:{ '单位错误':'只写了数字漏写"元/角"，或把元角换算弄错。','概念错误':'不清楚"张数×面值=总钱数"。' },
      task:'换算或计算钱数', method:'先统一单位(都化成分或角)再算', calc:'元角分进率'
    },
    '表内乘法': {
      knowledge:['乘法是"几个相同加数相加"的简便运算。','乘法口诀：一一得一……九九八十一，熟练口诀是提速关键。','因数交换位置，积不变。'],
      causes:{ '计算错误':'口诀背错或用错(如"六七"记成42而非42?应为42，常见记成36)。','概念错误':'不理解"几个几"，把加法个数数错。' },
      task:'根据口诀写出积', method:'想对应的乘法口诀直接得出积', calc:'乘法口诀'
    },
    '表内除法': {
      knowledge:['除法是"平均分"：把总数平均分成几份，求每份多少。','"被除数÷除数=商"，可用乘法口诀求商。','验算：商×除数=被除数。'],
      causes:{ '计算错误':'想错口诀或把被除数看错。','概念错误':'分不清"平均分成几份"与"每几个分一份"。' },
      task:'根据口诀求出商', method:'想"几×除数=被除数"的口诀', calc:'乘除互逆'
    },
    '长度单位': {
      knowledge:['常用长度单位：厘米(cm)、米(m)，1米=100厘米。','较短物体用厘米，较长距离用米。','测量时尺的0刻度对准物体一端。'],
      causes:{ '单位错误':'该填"厘米"却填了"米"，或反之；没带单位。','概念错误':'对1厘米、1米的实际长短没概念。' },
      task:'选择合适的长度单位或数值', method:'先想物体实际长短，再定单位', calc:'单位选择'
    },
    '两三位数乘一位数': {
      knowledge:['笔算：从个位起，用一位数依次乘多位数每一位，哪一位乘得的积满几十，就向前一位进几。','先估算积大约是多少，可发现明显错误。','验算：交换因数再乘一遍，或用除法验算。'],
      causes:{ '计算错误':'进位时把进位数漏加、加错，或某一位乘积算错。','单位错误':'结果算对却漏写单位(厘米/元/平方厘米等)。','审题错误':'没看清是"乘"还是"加"，忽略了"大约"等词。','概念错误':'对"满几十进几"的算理不清，凭感觉写结果。' },
      rel:'明确"倍数/几倍/一共"等关键词，确定用乘法', method:'列竖式，相同数位对齐，标好进位', calc:'进位与数位对齐', task:'算出准确的积'
    },
    '长方形正方形面积': {
      knowledge:['长方形面积=长×宽；正方形面积=边长×边长。','面积单位用平方厘米(cm²)、平方米(m²)等，要带单位。','周长与面积不同：周长是四周长度，面积是表面大小。'],
      causes:{ '单位错误':'算出数值却漏写面积单位(如 cm²)。','概念错误':'把"面积"和"周长"公式混淆(误用 (长+宽)×2)。','计算错误':'长×宽时算错。' },
      rel:'已知长、宽求表面大小，用乘法', method:'确认长与宽，套用 长×宽', calc:'带面积单位', task:'求出面积并写单位'
    },
    '分数初步认识': {
      knowledge:['分数表示"把一个整体平均分成几份，取其中几份"。','分母表示平均分成的总份数，分子表示取了几份。','同分母分数比较：分子越大，分数越大。'],
      causes:{ '概念错误':'分不清分母(总份数)与分子(取了几份)。','审题错误':'没注意"平均"二字，或写反了分子分母。' },
      rel:'理清"平均分成几份、取几份"', method:'先写分母(总份数)，再写分子(取的份数)', calc:'分子分母含义', task:'用分数表示一份或几份'
    },
    '大数的认识': {
      knowledge:['数位顺序：个、十、百、千、万……每四位一级。','"几个千、几个百……"是对数位的理解。','读数写数都从高位起。'],
      causes:{ '概念错误':'数位数错，把"几千几百"写反或漏零。','计算错误':'拆分数位时算错。' },
      rel:'按数位拆分组成', method:'看每个数字在哪一位，就表示几个那单位', calc:'数位与零', task:'写出数的组成'
    },
    '运算律': {
      knowledge:['加法交换律：a+b=b+a；结合律：(a+b)+c=a+(b+c)。','乘法交换律/结合律类似。','简便计算常先凑整(如凑成整十整百)。'],
      causes:{ '计算错误':'括号位置搬错导致结果变。','概念错误':'没看出能"凑整"，硬算且算错。' },
      rel:'寻找能凑整的数先结合', method:'观察哪几个数相加能凑成整十/百', calc:'括号与凑整', task:'用运算律简便计算'
    },
    '小数加减法': {
      knowledge:['小数点对齐(也就是相同数位对齐)再加减。','哪一位不够减向前一位借一当十。','得数末尾的0一般化简。'],
      causes:{ '计算错误':'小数点没对齐，或退位借错。','概念错误':'误把小数当整数直接加减。' },
      rel:'明确相同计数单位才能相加减', method:'先对齐小数点，再按位加减', calc:'小数点对齐', task:'算出小数和/差'
    },
    '小数乘除法': {
      knowledge:['小数乘法：先按整数乘，再看因数共有几位小数，从积右边起数出几位点上小数点。','小数除法：把除数化成整数再除。','积的小数位数=两因数小数位数之和。'],
      causes:{ '计算错误':'小数点位置点错(位数数错)。','概念错误':'不清楚积的小数位数怎么定。' },
      rel:'确定积的小数位数', method:'先按整数算，再点小数点', calc:'小数点定位', task:'算出小数乘积'
    },
    '多边形面积': {
      knowledge:['平行四边形面积=底×高；三角形=底×高÷2；梯形=(上底+下底)×高÷2。','"高"是与底互相垂直的线段长度。','面积要带平方单位。'],
      causes:{ '计算错误':'底×高算错，或三角形忘÷2。','单位错误':'漏写面积单位。','概念错误':'把"底×邻边"误当面积(应用高)。' },
      rel:'认准底和对应的高，再选公式', method:'选对图形公式，代入底和高', calc:'带单位、三角形÷2', task:'求出图形面积'
    },
    '因数与倍数': {
      knowledge:['如果 a÷b 整除，则 b 是 a 的因数，a 是 b 的倍数。','一个数最小的因数是1，最大的因数是它本身。','2的倍数个位是0/2/4/6/8(偶数)。'],
      causes:{ '概念错误':'因数与倍数关系搞反，或漏写1和它本身。','审题错误':'没看清"写出两个因数"的数量要求。' },
      rel:'用整除关系确定因数', method:'想"几×几=这个数"', calc:'因倍关系', task:'写出指定因数'
    },
    '分数乘除': {
      knowledge:['分数乘整数/分数：分子相乘做分子，分母相乘做分母，能约分的先约分。','分数除以一个数=乘它的倒数。','1乘以任何数还得原数(如 a×1/a=1)。'],
      causes:{ '计算错误':'分子分母相乘算错，或忘约分。','概念错误':'把"乘分数"误算成"加分数"。' },
      rel:'确定是乘还是除以分数', method:'整数与分子相乘、分母不变，再约分', calc:'约分', task:'算出分数运算结果'
    },
    '圆的周长面积': {
      knowledge:['圆的周长 C=2πr 或 πd；面积 S=πr²。','半径 r、直径 d=2r，π 通常取 3.14。','计算面积时 r 要先平方再乘 π。'],
      causes:{ '计算错误':'忘把半径平方(误用 2r×π 当面积)，或 π 取值错。','单位错误':'面积应写 cm²，周长写 cm。','概念错误':'周长与面积公式混淆。' },
      rel:'区分求"一周长度"还是"表面大小"', method:'求面积用 S=πr²，先平方再乘π', calc:'r² 与单位', task:'求出圆的周长或面积'
    },
    '百分数': {
      knowledge:['百分数表示一个数是另一个数的百分之几，符号 %。','"求 A 是 B 的百分之几"用 A÷B×100%。','百分数常用来表示比率、折扣、增长率。'],
      causes:{ '计算错误':'A÷B 算错，或忘乘 100%。','概念错误':'把"百分数"与"分数/小数"转换弄混。' },
      rel:'明确"谁÷谁"再化百分', method:'用部分÷整体，结果乘100加%', calc:'乘100%', task:'求出百分数'
    }
  };

  /* ---------- 工具 ---------- */
  function esc(s){ return UI ? UI.esc(s) : (''+ (s==null?'':s)); }
  function norm(s){ return (s==null?'':String(s)).replace(/\s/g,''); }
  function isTrue(ans){ return /^(对|正确|√|true|是|√)$/i.test(norm(ans)); }

  function defaultCause(errType, q){
    var kp = q&&q.kp ? ('“'+q.kp+'”') : '本题';
    var m = {
      '计算错误':'计算结果与标准答案不符，可能在计算步骤中出现了进位、退位或粗心错误，建议算完再验算一遍。',
      '单位错误':'结果算对了，但漏写或写错单位，' + kp + '题一定要带上单位(如厘米、平方厘米、元)。',
      '审题错误':'没审清题意，没看清"求什么、已知什么"，建议先把题目多读两遍、划出关键条件再动笔。',
      '概念错误':'对' + kp + '的核心概念理解有偏差，建议回看课本例题，理解"为什么这样做"。',
      '未完成':'这道题还没完成作答，试着独立思考，不会的地方请老师或家长讲一讲。'
    };
    return m[errType] || ('这道题还需要再练一练，重点巩固' + kp + '。');
  }
  function defaultTip(type){
    var m = {
      '选择':'选择题可用"排除法"：先排除明显错误项，再在剩下选项中比较确定。',
      '判断':'判断题要找关键词(如"一定""可能""平均")，举一个反例就能判定为错。',
      '填空':'填空题注意单位和书写格式，算完把答案代回题目读一遍是否通顺。',
      '竖式':'竖式题把进位数记在旁边，相同数位对齐，算完用估算验证。',
      '口算':'口算前先估算大致范围，可快速发现明显错误。',
      '应用题':'应用题按"读题→找数量关系→列式→计算→作答"五步做，别跳步。'
    };
    return m[type] || '做完后把答案代回题目检查一遍，确认无误再提交。';
  }

  /* ---------- 解题步骤(按题型自适应) ---------- */
  function buildSolution(type, q, info){
    var stem = q ? q.stem : '';
    var ans = q ? q.answer : '';
    var opts = (q && q.options) ? q.options : null;
    var steps = [];
    var text = '';
    type = type || (q && q.type) || '填空';

    if (type === '判断') {
      var tf = isTrue(ans) ? '这句话是对的' : '这句话是错的';
      text = '本题为判断题，考查“' + (q ? q.kp : '相关概念') + '”。判断依据：' +
        (info && info.method ? info.method + '。' : '结合概念分析题目说法是否符合定义与规律。') +
        ' 结论：' + tf + '。';
      steps = [
        '读清题目说法，圈出关键词(如"一定""平均""所有")。',
        '回忆“' + (q ? q.kp : '该知识点') + '”的相关概念或规律。',
        '用概念检验：能举出反例则为错，符合定义则为对。',
        '在括号里打“' + (ans || '') + '”。'
      ];
    } else if (type === '选择') {
      text = '本题为选择题，正确选项应为“' + (ans || '') + '”' +
        (opts ? ('（选项：' + opts.join('、') + '）') : '') + '。';
      steps = [
        '读题，明确题目在考“' + (q ? q.kp : '相关知识点') + '”。',
        '逐项代入检验：把每个选项代入题目情境看是否成立。',
        '排除明显错误项，比较剩余选项确定正确答案“' + (ans || '') + '”。',
        '确认后填涂对应选项。'
      ];
    } else if (type === '应用题') {
      text = '本题是一道与“' + (q ? q.kp : '相关知识点') + '”有关的应用题，按"读—找—列—算—答"五步解答。';
      var ansSent = ans ? ('得到结果 ' + ans + '。') : '算出结果。';
      steps = [
        '读题：弄清楚已知条件和要求的问题。',
        '找数量关系：本题关键是' + (info && info.rel ? info.rel + '。' : '理清已知与未知的联系。'),
        '列式：根据题意列出算式。',
        '计算：认真运算，注意' + (info && info.calc ? info.calc + '，' : '运算顺序与单位，') + ansSent,
        '作答：写清单位与答语——' + (ans ? ('答：' + stripQ(stem) + ans + '。') : '完整作答。')
      ];
    } else {
      // 填空 / 竖式 / 口算 / 其它
      text = '本题为' + type + '题，考查“' + (q ? q.kp : '相关知识点') + '”' +
        (ans ? ('，正确答案是 ' + ans + '。') : '。');
      var last = (/单位|厘米|米|平方|元/.test(stem || '') && type === '填空')
        ? '别忘了在答案后写上合适的单位。'
        : '检查一遍，确认无误。';
      steps = [
        '读题：明确题目要求' + (info && info.task ? info.task + '。' : '算出结果。'),
        '分析：' + (info && info.method ? info.method : ('结合“' + (q ? q.kp : '知识点') + '”的方法逐步推算。')),
        '计算/填写：得到' + (ans ? (' ' + ans + '。') : '正确结果。'),
        last
      ];
    }
    return { text: text, steps: steps };
  }

  function stripQ(stem){
    if (!stem) return '';
    return stem.replace(/[？?。].*$/, '是 ') ;
  }

  /* ---------- 核心：生成结构化解析 ---------- */
  function build(w, q){
    w = w || {};
    var type = (q && q.type) || w.type || '填空';
    var kp = (q && q.kp) || w.kp || '数学';
    var errType = w.errorType || '概念错误';
    var info = KP_INFO[kp] || {};

    // 错误原因分析：优先用知识点库里针对该错误类型的具体原因
    var cause = (info.causes && info.causes[errType]) || defaultCause(errType, q);

    // 正确解题思路：按题型自适应
    var sol = buildSolution(type, q, info);

    // 相关知识点关联
    var knowledge = (info.knowledge && info.knowledge.slice()) || ['回顾“' + kp + '”的课本例题与对应练习。'];

    // 防错小提示：题型 + 知识点库 tips
    var tip = (info.tips && info.tips[type]) || defaultTip(type);

    return {
      type: type, kp: kp, errorType: errType,
      errorCause: cause,
      solution: sol.text,
      steps: sol.steps,
      knowledge: knowledge,
      tips: tip,
      generatedAt: Date.now()
    };
  }

  /* ---------- 从后端动态加载（与现有数据接口对接） ----------
   * 解析写回 wrongBook 记录的 analysis 字段，随 DB.save() 同步到 CloudBase。
   * 因此：① 已有 analysis 的记录直接返回(数据来自已同步的云端)；
   *       ② 没有的记录本地生成并写回，下一次/其它设备打开即"从后端加载"到同一份。
   * 返回 Promise<analysis>。 */
  async function load(w, q){
    if (w && w.analysis && w.analysis.solution) return w.analysis;
    var a = build(w, q);
    if (w && w.id) {
      try {
        var db = DB.get();
        var rec = DB.byId(db.wrongBook, w.id);
        if (rec && (!rec.analysis || !rec.analysis.solution)) {
          rec.analysis = a;
          rec.analysisAt = Date.now();
          DB.save(db); // 经现有 CloudBase 同步管线持久化到后端
        }
      } catch (e) { /* 离线也不影响本次展示 */ }
    }
    return a;
  }

  /* ---------- 渲染：折叠展开 + 字号缩放 ---------- */
  function det(summary, bodyHtml){
    return '<details class="ana-sec" open><summary>'+summary+'</summary><div class="ana-sec-body">'+bodyHtml+'</div></details>';
  }
  function cardHTML(w, q, ana, opts){
    opts = opts || {};
    var id = (w && w.id) ? w.id : ('q'+Math.random().toString(36).slice(2,7));
    var head = opts.head ? ('<div class="ana-head">'+esc(opts.head)+'</div>') : '';
    var secs = '';
    secs += det('🔍 错误原因分析', '<p>'+esc(ana.errorCause)+'</p>');
    var solBody = '<p>'+esc(ana.solution)+'</p>';
    if (ana.steps && ana.steps.length) {
      solBody += '<ol class="ana-steps">' + ana.steps.map(function(s){ return '<li>'+esc(s)+'</li>'; }).join('') + '</ol>';
    }
    secs += det('✅ 正确解题思路', solBody);
    secs += det('📚 相关知识点', '<ul class="ana-kp">' + ana.knowledge.map(function(k){ return '<li>'+esc(k)+'</li>'; }).join('') + '</ul>');
    secs += det('💡 防错小提示', '<p>'+esc(ana.tips)+'</p>');
    var fontBar = '<div class="ana-fontbar"><span class="muted">字号</span>'+
      '<button type="button" class="btn btn-sm ana-font" data-d="-1" aria-label="缩小字号">A-</button>'+
      '<button type="button" class="btn btn-sm ana-font" data-d="0" aria-label="恢复默认字号">A</button>'+
      '<button type="button" class="btn btn-sm ana-font" data-d="1" aria-label="放大字号">A+</button></div>';
    return '<div class="ana" data-ana="'+esc(id)+'">'+head+
      '<div class="ana-body" id="ana-body-'+esc(id)+'">'+fontBar+secs+'</div></div>';
  }

  /* 在错题本中：返回一个"解析"按钮 + 一个用于装载解析的宿主容器 */
  function toggleHTML(w){
    return '<button type="button" class="btn btn-sm ana-toggle" data-ana-toggle="'+esc(w.id)+'">📖 文字解析</button>'+
           '<div class="ana-host" id="ana-host-'+esc(w.id)+'" style="display:none"></div>';
  }

  /* 练习即时反馈 / 弹窗：直接弹出完整解析 modal */
  function modal(q, wlike){
    var a = build(wlike, q);
    UI.modal({
      title: '📖 文字解析' + (q && q.kp ? ' · ' + q.kp : ''),
      body: cardHTML({ id:'modal' }, q, a),
      actions: [{ label:'关闭', cls:'btn-primary' }],
      dismissable: true
    });
  }

  /* ---------- 事件委托：字号缩放 + 解析展开 ---------- */
  var _inited = false;
  function init(){
    if (_inited) return; _inited = true;
    applyFont();
    document.addEventListener('click', function(e){
      var f = e.target.closest && e.target.closest('.ana-font');
      if (f) { changeFont(parseInt(f.getAttribute('data-d'), 10) || 0); return; }
      var t = e.target.closest && e.target.closest('[data-ana-toggle]');
      if (t) { toggleAna(t.getAttribute('data-ana-toggle')); }
    });
  }
  function changeFont(d){
    var cur = parseInt(localStorage.getItem('mathai_ana_font') || '15', 10);
    if (d === 0) cur = 15;
    else cur = Math.max(13, Math.min(22, cur + d));
    localStorage.setItem('mathai_ana_font', String(cur));
    applyFont();
  }
  function applyFont(){
    var px = parseInt(localStorage.getItem('mathai_ana_font') || '15', 10);
    document.documentElement.style.setProperty('--ana-font', px + 'px');
  }
  function toggleAna(wid){
    var host = document.getElementById('ana-host-' + wid);
    if (!host) return;
    if (host.style.display !== 'none' && host.dataset.loaded) {
      host.style.display = 'none';
      var btn = document.querySelector('[data-ana-toggle="'+wid+'"]');
      if (btn) btn.textContent = '📖 文字解析';
      return;
    }
    host.style.display = 'block';
    var btn = document.querySelector('[data-ana-toggle="'+wid+'"]');
    if (btn) btn.textContent = '🔼 收起解析';
    if (host.dataset.loaded) return; // 已加载过，仅展开
    host.innerHTML = '<div class="ana-loading muted">解析生成中…</div>';
    // 查找记录与题目，动态加载(并写回后端)
    var w, q;
    try {
      var db = DB.get();
      w = DB.byId(db.wrongBook, wid);
      if (w) q = AI.findQ(w.hwId, w.qid);
    } catch (e) {}
    Analysis.load(w, q).then(function(a){
      if (host.dataset.loaded) return; // 防止重复渲染
      host.innerHTML = cardHTML(w, q, a);
      host.dataset.loaded = '1';
    });
  }

  global.Analysis = {
    build: build, load: load, cardHTML: cardHTML, toggleHTML: toggleHTML,
    modal: modal, init: init
  };
  // 自动初始化（DOM 已就绪时直接执行，否则等 DOMContentLoaded）
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
  }
})(window);
