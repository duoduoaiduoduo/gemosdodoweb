"""Render the saved snapshot using matplotlib; never fabricate/interpolate counts."""
import json,pathlib,os
os.environ.setdefault('MPLCONFIGDIR','/tmp/gemos-matplotlib')
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib import font_manager
root=pathlib.Path(__file__).resolve().parents[2]
font=os.environ.get('RESEARCH_CHINESE_FONT','/System/Library/Fonts/Supplemental/Arial Unicode.ttf')
font_manager.fontManager.addfont(font)
plt.rcParams.update({'font.family':font_manager.FontProperties(fname=font).get_name(),'font.size':11,'axes.unicode_minus':False,'svg.fonttype':'path'})
d=json.loads((root/'public/research/literature-trend.json').read_text());rows=d['rows'];years=[r['year'] for r in rows]
fig,axes=plt.subplots(1,2,figsize=(14,6.8));fig.patch.set_facecolor('#fafbf7')
fig.suptitle('新污染物相关英文术语的文献出现趋势（2010—2025）',fontsize=20,x=.07,ha='left',y=.96)
fig.text(.07,.895,'Europe PMC / PubMed来源记录 · 标题或摘要匹配 · 每条记录计一次',fontsize=12,color='#5a685d')
for ax,key,title,label in zip(axes,['mentions','per10000'],['年度命中文献数','按当年数据库总量归一化'],['命中文献记录数（条）','每万条记录中的命中数（条 / 万条）']):
    values=[r[key] for r in rows]
    ax.set_facecolor('#fafbf7');ax.plot(years,values,color='#42664b',marker='o',linewidth=2,markersize=4)
    ax.set_title(title,loc='left',pad=16,fontsize=13);ax.set_ylabel(label);ax.set_xlabel('发表年份（PUB_YEAR）');ax.set_ylim(0,max(values)*1.22)
    ax.set_xticks([2010,2013,2016,2019,2022,2025]);ax.grid(axis='y',color='#dde3d9');ax.set_axisbelow(True)
    for spine in ['top','right']:ax.spines[spine].set_visible(False)
    for i in [0,14,15]:
        value=values[i];text=f'{value:,.0f}' if key=='mentions' else f'{value:.2f}'
        ax.annotate(text,(years[i],value),xytext=((-15,16) if i==14 else (5,-18) if i==15 else (5,10)),textcoords='offset points',fontsize=10,color='#385a40')
fig.subplots_adjust(left=.07,right=.96,bottom=.28,top=.80,wspace=.27)
fig.text(.07,.18,'检索词（OR合并）：emerging contaminant(s)、emerging pollutant(s)、contaminant(s) of emerging concern。',fontsize=10)
fig.text(.07,.135,'每万条 = 当年命中数 ÷ 当年全部 SRC:MED 记录数 × 10,000。未纳入未结束的2026年；历史记录仍可能补录。',fontsize=10)
fig.text(.07,.09,'仅为固定数据库与术语的出现趋势；不是公众知晓率、政策重视率或全部新污染物研究数量。未覆盖中文数据库。',fontsize=10)
fig.text(.07,.045,'数据快照：'+d['retrievedAt'][:10]+' ｜ 检索式、逐年计数及原始响应：gemosdodo.art/graduation/research?view=history',fontsize=9,color='#63735d')
for ext in ['png','svg']:fig.savefig(root/f'public/research/literature-trend.{ext}',dpi=180,facecolor=fig.get_facecolor())
