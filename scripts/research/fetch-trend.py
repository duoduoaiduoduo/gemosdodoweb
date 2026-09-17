"""Refresh a reproducible Europe PMC count snapshot. No API key required."""
import concurrent.futures, datetime, json, pathlib, time, urllib.parse, urllib.request
ROOT=pathlib.Path(__file__).resolve().parents[2]
terms=['emerging contaminant','emerging contaminants','emerging pollutant','emerging pollutants','contaminant of emerging concern','contaminants of emerging concern']
term_query='('+' OR '.join('TITLE_ABS:"'+t+'"' for t in terms)+')'
base='SRC:MED'
endpoint='https://www.ebi.ac.uk/europepmc/webservices/rest/search'

def get(item):
    year,kind=item
    q=f'{base} AND PUB_YEAR:{year}'+(f' AND {term_query}' if kind=='mentions' else '')
    url=endpoint+'?'+urllib.parse.urlencode({'query':q,'format':'json','pageSize':1,'resultType':'idlist','synonym':'false'})
    for attempt in range(4):
        try:
            with urllib.request.urlopen(url,timeout=50) as r: data=json.load(r)
            assert isinstance(data.get('hitCount'),int),data
            assert data['request']['queryString']==q,data
            return {'year':year,'kind':kind,'query':q,'apiUrl':url,'retrievedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'response':data}
        except Exception:
            if attempt==3: raise
            time.sleep(2**attempt)

if __name__=='__main__':
    jobs=[(y,k) for y in range(2010,2026) for k in ['all','mentions']]
    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool: raw=list(pool.map(get,jobs))
    rows=[]
    for y in range(2010,2026):
        all_=next(r for r in raw if r['year']==y and r['kind']=='all')
        mention=next(r for r in raw if r['year']==y and r['kind']=='mentions')
        n=mention['response']['hitCount'];d=all_['response']['hitCount']
        assert 0<=n<=d and d>0
        rows.append({'year':y,'mentions':n,'total':d,'per10000':n/d*10000,'query':mention['query'],'searchUrl':'https://europepmc.org/search?query='+urllib.parse.quote(mention['query']), 'apiUrl':mention['apiUrl'],'denominatorApiUrl':all_['apiUrl']})
    out={'retrievedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'source':'Europe PMC / SRC:MED (PubMed records)','yearField':'PUB_YEAR','terms':terms,'field':'TITLE_ABS','unit':'matching records (not word occurrences)','denominator':'all SRC:MED records in the same publication year','synonymExpansion':False,'rows':rows}
    (ROOT/'public/research/literature-trend.json').write_text(json.dumps(out,ensure_ascii=False,indent=2)+'\n')
    (ROOT/'public/research/literature-trend-raw.json').write_text(json.dumps(raw,ensure_ascii=False,indent=2)+'\n')
    import csv
    with (ROOT/'public/research/literature-trend.csv').open('w') as f:
        w=csv.writer(f);w.writerow(['year','matching_records','all_MED_records','per_10000','query','numerator_api','denominator_api','retrieved_at'])
        for r in rows:w.writerow([r['year'],r['mentions'],r['total'],r['per10000'],r['query'],r['apiUrl'],r['denominatorApiUrl'],out['retrievedAt']])
    print(json.dumps(rows,ensure_ascii=False))
