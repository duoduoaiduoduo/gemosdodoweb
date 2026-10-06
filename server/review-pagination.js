// Conservative line budgeting keeps fixed-coordinate annotation pages stable.
// The generated pages are stored with each immutable document version.
function lines(text) {
  let count=1,units=0;
  for(const ch of text){if(ch==='\n'){count++;units=0;continue;}const width=ch.charCodeAt(0)>255?2:1;if(units+width>68){count++;units=0;}units+=width;}
  return count;
}
export function paginateSections(sections){
  const pages=[];
  for(const section of sections){
    const rich=Boolean(section.images?.length||section.tables?.length||section.sourceList||(section.links?.length||0)>2);
    let page={title:section.title,paragraphs:[],pending:'',links:[]};
    let available=pages.length===0?500:690;
    const flush=()=>{pages.push(page);page={title:`${section.title}（续）`,paragraphs:[],pending:'',links:[]};available=690;};
    for(const paragraph of section.paragraphs){
      // Split unusually long paragraphs without dropping or changing characters.
      const chars=Array.from(paragraph);
      for(let i=0;i<chars.length;i+=240){const text=chars.slice(i,i+240).join('');const height=lines(text)*32+18;if(height>available&&page.paragraphs.length)flush();page.paragraphs.push(text);available-=height;}
    }
    const footerCost=lines(section.pending)*26+44+(section.links?.length?35:0);
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
      for(let i=0;i<(section.links?.length||0);i+=8)pages.push({...base,sourceList:true,links:section.links.slice(i,i+8)});
    }
  }
  return pages;
}
