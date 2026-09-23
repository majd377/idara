const fs=require('fs');const path=require('path');const xlsx=require('xlsx');const db=require('../server/db');
const file=process.argv[2];if(!file){console.error('Usage: node scripts/import-excel.js /path/to/file.xlsx');process.exit(1)}
if(!fs.existsSync(file)) throw new Error('الملف غير موجود');
const wb=xlsx.readFile(file,{cellDates:true});
console.log('Sheets:',wb.SheetNames.join(', '));
for(const sn of wb.SheetNames){const rows=xlsx.utils.sheet_to_json(wb.Sheets[sn],{defval:null});console.log(`${sn}: ${rows.length} rows`);}
console.log('\nThis first importer is intentionally non-destructive: it inventories the workbook. Map-and-import handlers should be added after reviewing the exact column mapping for your source workbook.');
