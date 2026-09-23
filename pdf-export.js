// =========================
// Row-safe PDF export (V51)
// =========================
// Replaces the old CDN-loaded html2pdf.js pipeline, which used a heuristic
// "avoid: ['tr','.table tr']" page-break option that html2canvas/jsPDF do not
// reliably honor — a table row that straddled a page boundary was rasterized
// half on one page and half (or not at all) on the next, which is exactly the
// "half shows, half doesn't" bug.
//
// This version measures every row's real rendered height first, then groups
// whole rows into pages so a page boundary never falls inside a row. Each
// page group is rasterized separately with html2canvas and placed on its own
// jsPDF page. html2canvas and jsPDF are vendored locally (./vendor) instead
// of loaded from a CDN, so the export also works offline and does not depend
// on a third-party host being reachable.
export async function exportRowSafePdf({ headHtml, table, filename, doc, win }) {
  // `table` may live inside a hidden iframe (used to get a clean, app-CSS-free
  // print layout), so staging elements are created in that same document to
  // inherit its print styles. jsPDF/html2canvas are only loaded as <script>
  // tags on the TOP page though, so the library lookup always uses the real
  // top window regardless of which document `table` came from.
  const D = doc || table.ownerDocument || document;
  const W = win || window;
  if (!W.jspdf?.jsPDF || !W.html2canvas) {
    throw new Error('PDF_LIBS_NOT_LOADED');
  }
  const { jsPDF } = W.jspdf;
  const PAGE_W = 297, PAGE_H = 210, MARGIN = 6; // mm, A4 landscape
  const USABLE_W = PAGE_W - MARGIN * 2;
  const USABLE_H = PAGE_H - MARGIN * 2;
  const RENDER_SCALE = 2.5;
  const STAGE_WIDTH_PX = 1060; // matches the print template's designed width
  const MM_PER_PX = USABLE_W / STAGE_WIDTH_PX;
  const PX_PER_MM = 1 / MM_PER_PX;
  // A short timeout (rather than requestAnimationFrame) is used to yield for
  // layout because it behaves the same whether the element being measured
  // lives in the top document or inside the hidden iframe document.
  const nextFrame = () => new Promise(r => setTimeout(r, 0));

  const stage = D.createElement('div');
  stage.style.cssText = `position:fixed;left:-12000px;top:0;width:${STAGE_WIDTH_PX}px;background:#fff;direction:rtl;`;
  D.body.appendChild(stage);

  try {
    const thead = table.querySelector('thead');
    const rows = [...table.querySelectorAll('tbody tr')];
    const tableClass = table.className;
    const tableStyleAttr = table.getAttribute('style') || '';

    let headWrap = null;
    if (headHtml) {
      headWrap = D.createElement('div');
      headWrap.innerHTML = headHtml;
      stage.appendChild(headWrap);
    }
    const measureTable = D.createElement('table');
    measureTable.className = tableClass;
    measureTable.setAttribute('style', tableStyleAttr);
    measureTable.appendChild(thead.cloneNode(true));
    const measureBody = D.createElement('tbody');
    measureTable.appendChild(measureBody);
    stage.appendChild(measureTable);
    await nextFrame();

    const headPx = headWrap ? headWrap.getBoundingClientRect().height : 0;
    const theadPx = measureTable.querySelector('thead').getBoundingClientRect().height;

    const rowHeights = rows.map(r => {
      const clone = r.cloneNode(true);
      measureBody.appendChild(clone);
      const h = clone.getBoundingClientRect().height;
      measureBody.removeChild(clone);
      return h;
    });

    stage.removeChild(measureTable);
    if (headWrap) stage.removeChild(headWrap);

    const usableFirstPagePx = (USABLE_H * PX_PER_MM) - headPx - theadPx;
    const usableOtherPagePx = (USABLE_H * PX_PER_MM) - theadPx;

    const groups = [];
    let cur = [], budget = usableFirstPagePx;
    for (let i = 0; i < rows.length; i++) {
      const h = rowHeights[i];
      if (cur.length && budget - h < 0) {
        groups.push(cur);
        cur = [];
        budget = usableOtherPagePx;
      }
      cur.push(i);
      budget -= h;
    }
    groups.push(cur); // always at least one group, even for an empty table

    const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'landscape', compress: true });

    for (let g = 0; g < groups.length; g++) {
      const wrap = D.createElement('div');
      wrap.style.cssText = `background:#fff;width:${STAGE_WIDTH_PX}px;direction:rtl;`;
      if (g === 0 && headWrap) wrap.appendChild(headWrap.cloneNode(true));
      const tbl = D.createElement('table');
      tbl.className = tableClass;
      tbl.setAttribute('style', tableStyleAttr);
      tbl.appendChild(thead.cloneNode(true));
      const tbody = D.createElement('tbody');
      for (const idx of groups[g]) tbody.appendChild(rows[idx].cloneNode(true));
      tbl.appendChild(tbody);
      wrap.appendChild(tbl);
      stage.appendChild(wrap);
      await nextFrame();

      const canvas = await W.html2canvas(wrap, {
        scale: RENDER_SCALE, useCORS: true, backgroundColor: '#ffffff', logging: false, windowWidth: STAGE_WIDTH_PX
      });
      stage.removeChild(wrap);

      const imgData = canvas.toDataURL('image/jpeg', 0.98);
      const imgWmm = USABLE_W;
      const imgHmm = (canvas.height / canvas.width) * imgWmm;
      if (g > 0) pdf.addPage();
      pdf.addImage(imgData, 'JPEG', MARGIN, MARGIN, imgWmm, Math.min(imgHmm, USABLE_H));
    }

    pdf.save(filename);
    return { pages: groups.length, rows: rows.length };
  } finally {
    if (stage.parentNode) stage.parentNode.removeChild(stage);
  }
}
