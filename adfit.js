// 카카오 애드핏 반응형 삽입
// 광고가 들어갈 자리의 실제 폭을 측정해, 728px가 들어가면 PC 배너(728×90),
// 아니면 모바일 배너(320×100)를 띄운다. 한 페이지엔 하나만 로드.
(function () {
    var cur = document.currentScript;
    if (!cur || !cur.parentNode) return;

    // 광고를 가운데 정렬할 래퍼
    var wrap = document.createElement('div');
    wrap.style.cssText = 'display:flex;justify-content:center;align-items:center;width:100%;';
    cur.parentNode.insertBefore(wrap, cur);

    var avail = wrap.clientWidth || window.innerWidth || 320;
    var pc = avail >= 728;
    var adH = pc ? 90 : 100;

    // 광고 자리를 미리 예약해 로드 시 레이아웃 밀림(CLS) 방지. 광고는 이 슬롯에 그대로 노출.
    wrap.style.minHeight = (adH + 24) + 'px'; // 광고 높이 + margin(16+8)

    var ins = document.createElement('ins');
    ins.className = 'kakao_ad_area';
    ins.style.cssText = 'display:none;margin:16px 0 8px;';
    ins.setAttribute('data-ad-unit', pc ? 'DAN-toY1URhbBemsgCc6' : 'DAN-LJxzhNvLbwF6UZxT');
    ins.setAttribute('data-ad-width',  pc ? '728' : '320');
    ins.setAttribute('data-ad-height', pc ? '90'  : '100');
    wrap.appendChild(ins);

    // 애드핏 로더는 페이지당 한 번만
    if (!window.__adfitLoaded) {
        window.__adfitLoaded = true;
        var s = document.createElement('script');
        s.type = 'text/javascript';
        s.src = '//t1.kakaocdn.net/kas/static/ba.min.js';
        s.async = true;
        document.body.appendChild(s);
    }
})();
