V41 fixes
- Contribution routing separated into utility discount, expense discount, and fund contribution.
- Fund contributions create linked fund revenue records and never reduce water/expense calculations.
- PDF download now renders the exact same self-contained print HTML in an isolated iframe before html2pdf capture.
- Excel exports use xlsx-js-style with Arabic RTL workbook view, styled headers, widths, borders, row heights, freeze header and autofilter.
- Guide now has Next/Previous navigation and updated instructions.
- Removed persistent Quick Payment button.
- Viewer and resident roles are read-only in UI and Firestore reads; writes remain blocked by rules.
- Added PWA manifest, icons and service worker for Chrome install as standalone app.
