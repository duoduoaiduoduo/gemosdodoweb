export {reportPages, reportRevision} from './reviewDocumentData.js';
export type ReportPage = {
  title:string;
  paragraphs:string[];
  continuationParagraphs?:number[];
  pending:string;
  links?:string[][];
  images?:{src:string;alt:string;caption:string;displayHeight?:number}[];
  tables?:{caption:string;rows:string[][];widths:number[]}[];
  sourceList?:boolean;
};
