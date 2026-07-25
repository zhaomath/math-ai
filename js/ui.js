/* =========================================================
 * ui.js —— 通用 UI 组件与工具
 * ========================================================= */
(function (global) {
  'use strict';
  function esc(s){ return (s==null?'':String(s)).replace(/[&<>"']/g,function(c){
    return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); }

  function toast(msg){
    var root=document.getElementById('toast-root');
    var t=document.createElement('div'); t.className='toast'; t.textContent=msg;
    root.appendChild(t);
    requestAnimationFrame(function(){ t.classList.add('show'); });
    setTimeout(function(){ t.classList.remove('show'); setTimeout(function(){ t.remove(); },300); }, 2200);
  }

  /* 模态：opts={title, body(HTML字符串), actions:[{label,cls,onClick(close)}]} */
  function modal(opts){
    var root=document.getElementById('modal-root');
    var mask=document.createElement('div'); mask.className='modal-mask';
    var box=document.createElement('div'); box.className='modal';
    var html='<h3>'+esc(opts.title||'')+'</h3><div class="modal-body">'+(opts.body||'')+'</div><div class="row end" id="modal-actions"></div>';
    box.innerHTML=html; mask.appendChild(box); root.appendChild(mask);
    var actions=document.getElementById('modal-actions');
    function close(){ mask.remove(); }
    (opts.actions||[{label:'关闭',cls:'btn',onClick:close}]).forEach(function(a){
      var b=document.createElement('button'); b.className='btn '+(a.cls||''); b.textContent=a.label;
      b.onclick=function(){ a.onClick?a.onClick(close):close(); };
      actions.appendChild(b);
    });
    mask.onclick=function(e){ if(e.target===mask && opts.dismissable!==false) close(); };
    return close;
  }

  function confirm(msg, onYes){
    modal({ title:'请确认', body:'<p>'+esc(msg)+'</p>',
      actions:[
        { label:'取消', cls:'', onClick:function(c){ c(); } },
        { label:'确定', cls:'btn-primary', onClick:function(c){ c(); onYes&&onYes(); } }
      ] });
  }

  function fmtDate(ts){ if(!ts) return '-'; var d=new Date(ts);
    return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate())+' '+pad(d.getHours())+':'+pad(d.getMinutes()); }
  function pad(n){ return n<10?'0'+n:''+n; }

  function go(hash){ location.hash=hash; }

  function el(html){ var d=document.createElement('div'); d.innerHTML=html.trim(); return d.firstChild; }

  global.UI = { esc:esc, toast:toast, modal:modal, confirm:confirm, fmtDate:fmtDate, go:go, el:el, pad:pad };
})(window);
