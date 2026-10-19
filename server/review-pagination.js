// Conservative line budgeting keeps fixed-coordinate annotation pages stable.
// The generated pages are stored with each immutable document version.
function lines(text) {
  let count=1,units=0;
  for(const ch of text){if(ch==='\n'){count++;units=0;continue;}const width=ch.charCodeAt(0)>255?2:1;if(units+width>68){count++;units=0;}units+=width;}
  return count;
}
const PAGE_HEIGHT=690;
const paragraphHeight=text=>lines(text)*32+18;
const isHeading=text=>Array.from(text).length<=80&&!/[\n。！？!?；;]/u.test(text)&&/^(?:\d+\.\d+(?:\.\d+)?\s|[（(]\d+[）)])/u.test(text);

// Find a real page break, rather than turning a fixed character count into a
// new paragraph. Code-point slices preserve emoji and all original text.
function fragmentEnd(chars,start,available,tailHeight=0){
  let low=1,high=chars.length-start,best=0;
  while(low<=high){
    const length=Math.floor((low+high)/2);
    const extra=start+length===chars.length?tailHeight:0;
    if(paragraphHeight(chars.slice(start,start+length).join(''))+extra<=available){best=length;low=length+1;}
    else high=length-1;
  }
  return start+best;
}
export function paginateSections(sections){
  const pages=[];
  for(const section of sections){
    // This is opt-in: historical stored pages and the legacy pagination path
    // keep their geometry. Source paragraphs remain the editable source text.
    const inlineReferences=section.inlineReferenceLinks===true;
    const numberedLinks=new Map();
    if(inlineReferences)for(const link of section.links||[]){
      const number=link[0]?.match(/^\s*\[(\d+)\]/)?.[1];
      if(number){if(!numberedLinks.has(number))numberedLinks.set(number,[]);numberedLinks.get(number).push(link);}
    }
    const linksFor=text=>inlineReferences?numberedLinks.get(text.match(/^\s*\[(\d+)\]/)?.[1])||[]:[];
    // The smaller supplementary labels are block links, each with a 5px gap.
    // Using the prose line width is deliberately conservative at their 12px size.
    const supplementHeight=links=>links.slice(1).reduce((height,[label])=>height+lines(label)*20+5,0);
    const rich=Boolean(inlineReferences||section.images?.length||section.tables?.length||section.sourceList||(section.links?.length||0)>2);
    let page={title:section.title,paragraphs:[],pending:'',links:[]};
    let available=pages.length===0?500:690;
    const flush=()=>{pages.push(page);page={title:`${section.title}（续）`,paragraphs:[],pending:'',links:[]};available=PAGE_HEIGHT;};
    const appendParagraph=(text,links)=>{
      const index=page.paragraphs.length;
      page.paragraphs.push(text);
      if(links.length)(page.paragraphLinks||=[]).push({index,links:links.map(link=>[...link])});
    };
    const keepHeadings=section.keepHeadingsWithNext!==false;
    let openingParagraph=-1;
    for(let paragraphIndex=0;paragraphIndex<section.paragraphs.length;paragraphIndex++){
      const paragraph=section.paragraphs[paragraphIndex];
      if(!paragraph.length)continue;
      const paragraphLinks=linksFor(paragraph);
      const extraHeight=supplementHeight(paragraphLinks);
      if(extraHeight+paragraphHeight(Array.from(paragraph).at(-1))>PAGE_HEIGHT)throw new Error('Supplementary reference links exceed one page.');
      // New pages keep consecutive headings with the following paragraph. If
      // that group exceeds a whole page, reserve at least two opening lines.
      if(keepHeadings&&isHeading(paragraph)&&(paragraphIndex===0||!isHeading(section.paragraphs[paragraphIndex-1]))){
        let headingHeight=0,bodyHeight=0,bodyIndex=-1;
        for(let next=paragraphIndex;next<section.paragraphs.length;next++){
          const text=section.paragraphs[next];
          if(!isHeading(text)){bodyHeight=paragraphHeight(text)+supplementHeight(linksFor(text));bodyIndex=next;break;}
          headingHeight+=paragraphHeight(text);
        }
        const mustSplit=headingHeight+bodyHeight>PAGE_HEIGHT;
        const groupHeight=headingHeight+(mustSplit?Math.min(bodyHeight,82):bodyHeight);
        if(mustSplit)openingParagraph=bodyIndex;
        if(Math.min(groupHeight,PAGE_HEIGHT)>available&&page.paragraphs.length)flush();
        if(groupHeight>available&&!page.paragraphs.length)openingParagraph=bodyIndex;
      }
      const height=paragraphHeight(paragraph)+extraHeight;
      if(height<=available){appendParagraph(paragraph,paragraphLinks);available-=height;continue;}
      const keepOpening=paragraphIndex===openingParagraph;
      // A paragraph that fits a fresh page moves there intact. Only a genuine
      // page boundary may split prose, including the shorter cover-page area.
      if(page.paragraphs.length&&!keepOpening){
        flush();
        if(height<=available){appendParagraph(paragraph,paragraphLinks);available-=height;continue;}
      }
      const chars=Array.from(paragraph);
      let start=0;
      while(start<chars.length){
        const end=fragmentEnd(chars,start,available,extraHeight);
        if(end===start){flush();continue;}
        const text=chars.slice(start,end).join('');
        if(start>0)(page.continuationParagraphs||=[]).push(page.paragraphs.length);
        const final=end===chars.length;
        appendParagraph(text,final?paragraphLinks:paragraphLinks.slice(0,1));
        available-=paragraphHeight(text)+(final?extraHeight:0);start=end;
        if(start<chars.length)flush();
      }
    }
    const footerCost=(section.pending?lines(section.pending)*26+44:0)+(!rich&&section.links?.length?35:0);
    if(footerCost>available&&page.paragraphs.length)flush();
    page.pending=section.pending;page.links=rich?[]:section.links||[];
    if(page.paragraphs.length||page.pending||!rich)pages.push(page);
    if(rich){
      const base={title:`${section.title}（图表与来源）`,paragraphs:[],pending:'',links:[]};
      for(const table of section.tables||[]){
        const rowHeight=row=>Math.max(...row.map((cell,i)=>{
          const budget=Math.max(12,Math.floor((630*(table.widths[i]||1/row.length)-24)/6));
          let count=1,units=0;
          for(const ch of cell){const width=ch.charCodeAt(0)>255?2:1;if(ch==='\n'||units+width>budget){count++;units=0;}if(ch!=='\n')units+=width;}
          return count*20+16;
        }));
        let rows=[table.rows[0]],height=rowHeight(table.rows[0]);
        for(const row of table.rows.slice(1)){
          const h=rowHeight(row);
          if(rows.length>1&&height+h>590){pages.push({...base,tables:[{...table,rows}]});rows=[table.rows[0]];height=rowHeight(table.rows[0]);}
          rows.push(row);height+=h;
        }
        pages.push({...base,tables:[{...table,rows}]});
      }
      for(const image of section.images||[])pages.push({...base,images:[image]});
      if(!inlineReferences)for(let i=0;i<(section.links?.length||0);i+=8)pages.push({...base,sourceList:true,links:section.links.slice(i,i+8)});
    }
  }
  return pages;
}
