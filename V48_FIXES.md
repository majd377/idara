V48 fixes

- Financial calculations no longer use Math.round for water, electricity, service allocations, or report values; money is displayed to one decimal while underlying calculations remain precise.
- Water unit price remains exact internally; all roles use the same value and the same one-decimal display, with no round-up applied to the stored calculation.
- Resident message format updated exactly to the requested weekly-services template and Arabic date wording.
- PDF download now renders the same fixed A4 landscape print page used by the print workflow. The downloadable PDF captures only the printable A4 sheet instead of the iframe body.
- Resident report tables stay inside their cards; subscriber buildings/units panels stack when the available width becomes tight, preventing page-level horizontal overflow.
- Entrypoint/version bumped to V48.
