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
    page.pending=section.pending;page.links=section.links||[];pages.push(page);
  }
  return pages;
}
