"""Rebuild the bid brand kit. Requires reportlab, fonttools[woff], requests, pillow.
Run from any directory; outputs stay in docs/brand and output/pdf.
"""
from pathlib import Path
import json, html, io, zipfile
import requests
from fontTools.ttLib import TTFont as Font
from fontTools.varLib.instancer import instantiateVariableFont
from reportlab.pdfgen import canvas
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.lib.colors import HexColor
from reportlab.lib.styles import ParagraphStyle
from reportlab.platypus import Paragraph
from reportlab.graphics import renderPDF
from reportlab.graphics.shapes import Drawing, Path as RPath
from fontTools.svgLib.path import parse_path
from fontTools.pens.basePen import BasePen

ROOT = Path(__file__).resolve().parent
REPO = ROOT.parent.parent
ASSETS = ROOT / 'assets'
FONTS = ROOT / 'fonts'
PDF = REPO / 'output/pdf/bid-manual-da-marca-v1.pdf'
for d in [ASSETS, FONTS, PDF.parent]: d.mkdir(parents=True, exist_ok=True)

INK, IVORY = '#171B31', '#F6F5F1'
MARK = 'M0 0H42V8H8V50H0Z M14 14H49L58 23V64H14Z'
WORD = ('M0 0H18V32C23 27 30 25 37 25C57 25 73 41 73 61C73 81 57 97 37 97C29 97 22 94 18 90V96H0Z '
        'M55 61A18 18 0 1 0 19 61A18 18 0 1 0 55 61Z '
        'M86 26H104V96H86Z M105 8A10 10 0 1 0 85 8A10 10 0 1 0 105 8Z '
        'M191 10L181 0H173V32C168 27 161 25 154 25C134 25 118 41 118 61C118 81 134 97 154 97C162 97 169 94 173 90V96H191Z '
        'M172 61A18 18 0 1 0 136 61A18 18 0 1 0 172 61Z')

def svg(kind='horizontal', color=INK):
    if kind=='symbol': vb,body='0 0 58 64', f'<path d="{MARK}"/>'
    elif kind=='wordmark': vb,body='0 -2 191 99',f'<path fill-rule="evenodd" d="{WORD}"/>'
    elif kind=='app':
        vb='0 0 512 512'
        body=f'<rect width="512" height="512" rx="112" fill="{INK}"/><path fill="{IVORY}" transform="translate(140 130) scale(4)" d="{MARK}"/>'
    else:
        vb='0 -2 281 99'
        body=f'<path transform="translate(0 15)" d="{MARK}"/><path transform="translate(90 0)" fill-rule="evenodd" d="{WORD}"/>'
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{vb}" fill="{color}" role="img" aria-label="bid">{body}</svg>'

for kind in ['horizontal','wordmark','symbol']:
    for name,col in [('indigo',INK),('ivory',IVORY),('black','#000000'),('white','#FFFFFF')]:
        (ASSETS/f'bid-{kind}-{name}.svg').write_text(svg(kind,col), encoding='utf-8')
(ASSETS/'bid-app-icon.svg').write_text(svg('app'), encoding='utf-8')

# Official unmodified variable font and license travel with every delivery.
for file,url in [('Sora-variable.ttf','https://raw.githubusercontent.com/google/fonts/main/ofl/sora/Sora%5Bwght%5D.ttf'),('OFL.txt','https://raw.githubusercontent.com/google/fonts/main/ofl/sora/OFL.txt')]:
    p=FONTS/file
    if not p.exists():
        response=requests.get(url,timeout=45); response.raise_for_status(); p.write_bytes(response.content)
font=Font(FONTS/'Sora-variable.ttf'); font.flavor='woff2'; font.save(FONTS/'Sora-variable.woff2')
for weight in [400,500,600,700]:
    target=FONTS/f'Sora-{weight}.ttf'
    instantiateVariableFont(Font(FONTS/'Sora-variable.ttf'),{'wght':weight},inplace=True).save(target)
    pdfmetrics.registerFont(TTFont(f'Sora{weight}', str(target)))

light={'bg':IVORY,'surface':'#FFFFFF','surface-subtle':'#EFEEE9','text':INK,'muted':'#626577','border':'#DCDDDf','control-border':'#858899','action':INK,'on-action':IVORY,'action-hover':'#2A304D','selected':'#E9EBF4','focus':'#4D5FA8','success':'#236344','success-bg':'#E8F3EC','warning':'#805315','warning-bg':'#FCF1DE','danger':'#AA3038','danger-bg':'#FBECEF'}
dark={'bg':'#111422','surface':'#1B2035','surface-subtle':'#242A42','text':IVORY,'muted':'#B9BDCC','border':'#363D56','control-border':'#8189A2','action':IVORY,'on-action':INK,'action-hover':'#DDDDD8','selected':'#303A5B','focus':'#B0BFFF','success':'#93D5AE','success-bg':'#19372A','warning':'#F0CB8B','warning-bg':'#3C301D','danger':'#FFB0B7','danger-bg':'#421F2B'}
tokens={'version':'1.0.0','color':{'light':light,'dark':dark},'font':{'family':'Sora','weights':[400,500,600,700],'scale':{'display':{'size':48,'lineHeight':56,'weight':600},'title':{'size':28,'lineHeight':36,'weight':600},'section':{'size':20,'lineHeight':28,'weight':600},'body':{'size':16,'lineHeight':24,'weight':400},'support':{'size':14,'lineHeight':20,'weight':400},'label':{'size':14,'lineHeight':20,'weight':600},'caption':{'size':12,'lineHeight':16,'weight':500}}},'space':{'1':4,'2':8,'3':12,'4':16,'5':20,'6':24,'8':32,'12':48,'16':64},'radius':{'control':8,'card':12,'sheet':20,'pill':999},'motion':{'fast':120,'normal':180},'control':{'minHeight':48,'minTarget':44}}
(ROOT/'tokens.json').write_text(json.dumps(tokens,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
css="""/* bid v1.0 — reference tokens; opt in with .bid-ds. Not imported by production. */
@font-face{font-family:Sora;src:url('./fonts/Sora-variable.woff2') format('woff2');font-weight:100 800;font-style:normal;font-display:swap}
"""
def declarations(values): return ';'.join(f'--bid-{k}:{v}' for k,v in values.items())+';'
css+='.bid-ds{'+declarations(light)+"--bid-font:Sora,system-ui,sans-serif;--bid-radius-control:8px;--bid-radius-card:12px;--bid-radius-sheet:20px;--bid-radius-pill:999px;--bid-motion-fast:120ms;--bid-motion-normal:180ms;--bid-control-height:48px;--bid-target-min:44px;"+''.join(f'--bid-space-{k}:{v}px;' for k,v in tokens['space'].items())+'font-family:var(--bid-font);color:var(--bid-text);background:var(--bid-bg);font-size:16px;line-height:1.5;}\n'
css+='@media(prefers-color-scheme:dark){.bid-ds:not([data-theme="light"]){'+declarations(dark)+'color-scheme:dark;}}\n'
css+='.bid-ds[data-theme="dark"]{'+declarations(dark)+'color-scheme:dark;}\n'
css+='''
.bid-ds *{box-sizing:border-box}.bid-ds button,.bid-ds input,.bid-ds select{font-family:inherit;font-size:inherit;line-height:inherit}
.bid-ds :where(button,a,input,select,textarea):focus-visible{outline:3px solid var(--bid-focus);outline-offset:3px}
.bid-btn{min-height:48px;padding:12px 20px;border:1px solid transparent;border-radius:8px;background:var(--bid-action);color:var(--bid-on-action);font-weight:600;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:8px;text-decoration:none;transition:background 120ms}
.bid-btn:not(:disabled):hover{background:var(--bid-action-hover)}.bid-btn:active{transform:translateY(1px)}
.bid-btn.secondary{background:var(--bid-surface);color:var(--bid-text);border-color:var(--bid-control-border)}
.bid-btn.secondary:not(:disabled):hover{background:var(--bid-selected)}.bid-btn:disabled{opacity:.45;cursor:not-allowed;transform:none}
.bid-field{display:grid;gap:8px;max-width:480px}.bid-field label{font-size:14px;font-weight:600}.bid-field input,.bid-field select{width:100%;min-height:48px;padding:12px;border:1px solid var(--bid-control-border);border-radius:8px;background:var(--bid-surface);color:var(--bid-text)}
.bid-field input::placeholder{color:var(--bid-muted)}.bid-field [aria-invalid=true]{border:2px solid var(--bid-danger)}
.bid-help{font-size:14px;color:var(--bid-muted)}.bid-error{font-size:14px;color:var(--bid-danger)}
.bid-card{padding:24px;border:1px solid var(--bid-border);border-radius:12px;background:var(--bid-surface)}
.bid-badge{display:inline-flex;gap:6px;align-items:center;padding:4px 8px;border-radius:999px;font-size:12px;font-weight:600;background:var(--bid-selected);color:var(--bid-text)}
.bid-badge.success{background:var(--bid-success-bg);color:var(--bid-success)}.bid-badge.warning{background:var(--bid-warning-bg);color:var(--bid-warning)}.bid-badge.danger{background:var(--bid-danger-bg);color:var(--bid-danger)}
.bid-num{font-variant-numeric:tabular-nums}.bid-ds a:not(.bid-btn){color:var(--bid-text);text-decoration:underline;text-underline-offset:4px}
@media(prefers-reduced-motion:reduce){.bid-ds *{transition:none!important;animation:none!important;scroll-behavior:auto!important}}
'''
(ROOT/'tokens.css').write_text(css,encoding='utf-8')

def luminance(c):
    a=[int(c[i:i+2],16)/255 for i in (1,3,5)]
    a=[v/12.92 if v<=.04045 else ((v+.055)/1.055)**2.4 for v in a]
    return sum(v*w for v,w in zip(a,[.2126,.7152,.0722]))
def contrast(a,b):
    l=sorted([luminance(a),luminance(b)]);return (l[1]+.05)/(l[0]+.05)
pairs=[('text','bg',4.5),('text','surface',4.5),('muted','bg',4.5),('muted','surface',4.5),('on-action','action',4.5),('on-action','action-hover',4.5),('text','selected',4.5),('success','success-bg',4.5),('warning','warning-bg',4.5),('danger','danger-bg',4.5),('focus','surface',3),('focus','bg',3),('control-border','surface',3)]
checks=[{'theme':theme,'foreground':a,'background':b,'ratio':round(contrast(values[a],values[b]),2),'minimum':req,'pass':contrast(values[a],values[b])>=req} for theme,values in [('light',light),('dark',dark)] for a,b,req in pairs]
assert all(c['pass'] for c in checks), checks
(ROOT/'contrast-report.json').write_text(json.dumps(checks,indent=2)+'\n',encoding='utf-8')

SECTIONS = [
('01','Essência','Clareza para decidir.',[
('O que é o bid','Um acervo de propostas de obra que organiza documentos, preserva versões e apoia a comparação até a contratação. Armazenar vem primeiro; comparar e contratar ampliam esse valor.'),
('Personalidade','Preciso, sereno e confiável. A sofisticação aparece no espaço, na legibilidade e na consistência. Cada elemento precisa ajudar a encontrar, entender ou decidir.'),
('Princípios','Uma ação principal por contexto. Informações essenciais primeiro. Formas simples. Cor com função. A marca acompanha o conteúdo sem competir com ele.')]),
('02','Assinatura visual','Duas folhas. Um acervo.',[
('Conceito','Duas folhas sobrepostas representam propostas e suas versões. O recorte diagonal da folha frontal conversa com o terminal do “d”. O símbolo é preenchido e funciona em uma única cor.'),
('Composição oficial','Símbolo à esquerda e lettering “bid” à direita. A palavra é um desenho vetorial próprio inspirado na direção tipográfica aprovada: nunca redigitar para reconstruir a marca.'),
('Versões','Horizontal para cabeçalhos e documentos; lettering isolado quando a marca já estiver contextualizada; símbolo para ícone do aplicativo, avatar e favicon. Usar os SVGs mestres.')]),
('03','Construção e respiro','Proporção é identidade.',[
('Geometria','Símbolo: 58 × 64 unidades. Folha traseira com espessura de 8 unidades; folha frontal inicia em (14,14); canto recortado de 9 unidades. Espaço mínimo entre as folhas: 6 unidades.'),
('Assinatura horizontal','Prancheta: 281 × 99 unidades. Símbolo em (0,15); lettering em (90,0). O intervalo visível entre símbolo e palavra é de 32 unidades. Escalar sempre o conjunto proporcionalmente.'),
('Área de proteção e mínimo','Defina x como 16 unidades da prancheta. Preserve ao menos x em todos os lados. Digital: assinatura com 112 px de largura; lettering com 64 px; símbolo com 24 px de altura. Impressão: 28 mm, 16 mm e 6 mm, respectivamente. Para favicon de 16 px, conferir a rasterização final.')]),
('04','Aplicação','Uma marca, poucos gestos.',[
('Fundos','Priorizar índigo sobre marfim ou branco; marfim ou branco sobre índigo. Em fotografia, reservar uma área lisa ou aplicar uma base sólida com espaço de proteção.'),
('O que preservar','Proporção, distância entre as formas, corte diagonal e cor única. Usar o ícone com margem interna generosa. A forma quadrada arredondada pertence ao ícone do app, não à assinatura horizontal.'),
('Evitar','Esticar, inclinar, contornar, adicionar folhas, usar degradê, sombra ou efeito metálico; trocar a fonte do lettering; colorir símbolo e palavra de forma independente; aplicar em fundos sem contraste.')]),
('05','Cores','Índigo profundo. Marfim.',[
('Paleta principal','Índigo #171B31: marca, texto e ação principal no tema claro. Marfim #F6F5F1: fundo e respiro. Branco #FFFFFF: superfícies. A identidade é essencialmente monocromática.'),
('Hierarquia','Texto secundário #626577. Divisórias #DCDDDF são decorativas; controles usam borda #858899. Foco #4D5FA8. Não usar o tom claro de divisória para identificar um campo sozinho.'),
('Semântica','Verde identifica sucesso; âmbar, atenção; vermelho, erro ou atraso. Sempre acompanhar de texto e, quando útil, ícone. Estados de negócio precisam de nomes explícitos, não apenas pontos coloridos.')]),
('06','Tipografia','Sora, com precisão.',[
('Família de interface','Sora é a fonte de títulos, textos, controles e números. Usar os arquivos locais incluídos e manter OFL.txt na distribuição. Fallback: system-ui, sans-serif. O lettering da marca permanece vetorial.'),
('Escala','Display 48/56, peso 600; título de página 28/36, 600; seção 20/28, 600; corpo 16/24, 400; apoio 14/20, 400; rótulo 14/20, 600; legenda e status 12/16, 500. Os pares indicam tamanho/entrelinha em px.'),
('Regras','Usar caixa de frase, evitar textos longos em maiúsculas. Números tabulares em preços e comparações. Campos em 16 px. Não reduzir textos essenciais abaixo de 14 px; 12 px é reservado a metadados curtos.')]),
('07','Estrutura','Espaço para o conteúdo.',[
('Ritmo','Escala de espaçamento: 4, 8, 12, 16, 20, 24, 32, 48 e 64 px. Conteúdo mobile com margem de 20 px; cartões com 24 px; distância entre seções de 32 px. Agrupar antes de acrescentar divisórias.'),
('Forma e movimento','Raio de controles: 8 px; cartões: 12 px; painéis: 20 px; badges: 999 px. Sombras apenas para elementos flutuantes. Transições de 120 a 180 ms. Respeitar preferência por movimento reduzido.'),
('Responsividade','Preservar o modelo atual: conteúdo do app com largura máxima de 440 px e navegação inferior. Em 320 px, empilhar preço e metadados quando necessário. Respeitar safe-area. Tabelas comparativas podem rolar em região própria, sem provocar rolagem horizontal na página.')]),
('08','Componentes','Consistência na ação.',[
('Botões','Altura padrão de 48 px; área de toque mínima de 44 × 44 px. Primário preenchido; secundário com contorno; ação textual com sublinhado quando link. Estados: padrão, hover, pressionado, foco, desabilitado e carregando.'),
('Formulários e upload','Rótulo persistente acima do campo. Placeholder é exemplo, nunca substituto do rótulo. Erro junto ao campo com aria-describedby e aria-invalid. Upload deve oferecer seletor de arquivo por teclado, progresso, cancelamento quando possível e nova tentativa.'),
('Cartões e navegação','Cartão de proposta: fornecedor, categoria/obra, versão, status e valor. Navegação: Propostas, Equalizar, Contratos, Obras. Item ativo usa texto, forma e aria-current. A ação de criar permanece no topo à direita.')]),
('09','Estados e linguagem','Confiança em cada etapa.',[
('Vazio, carregamento e erro','Vazio: “Seu acervo começa aqui.” + “Adicionar proposta”. Busca vazia: “Nenhuma proposta encontrada.” + “Limpar filtros”. Leitura: “Lendo proposta…” com anúncio de status. Erro: “Não foi possível enviar. Tente novamente.” Preservar os dados digitados.'),
('IA e decisões','Apresentar extração como informação a conferir: “Confira os dados antes de salvar”. Recomendação de comparação não é uma decisão automática. A ação “Definir vencedora” deve nomear o fornecedor e oferecer “Desfazer” no fluxo previsto.'),
('Tom e formatos','Português brasileiro, frases diretas, sem jargão desnecessário. “Salvar proposta”, “Adicionar versão”, “Gerar contrato”. Valores em R$ 12.450,00; datas em 29/10/2026 quando a precisão for necessária. Não atribuir erro ao usuário.')]),
('10','Acessibilidade','Legível. Operável. Claro.',[
('Contraste','Texto normal: ao menos 4,5:1; texto grande e elementos essenciais não textuais: 3:1. Os pares especificados foram calculados nos dois temas. Divisórias decorativas não substituem contornos de controles.'),
('Interação','Foco visível de 3 px com afastamento de 3 px; operação por teclado; nome acessível em botões com ícone. Modais precisam de foco inicial, contenção de foco e retorno ao acionador. Status dinâmico usa região viva adequada.'),
('Validação do produto','Verificar zoom de 200%, fluxo a 320 px, leitor de tela, textos longos, estados de erro e alvos de toque. A aprovação dos tokens não equivale a uma auditoria completa do aplicativo. Garantir que ações temporárias também tenham alternativa persistente quando necessário.')]),
('11','Entrega e adoção','Uma fonte de verdade.',[
('Arquivos','assets/: símbolos, lettering e assinaturas em SVG, versões índigo, marfim, preto e branco; ícone do app. fonts/: Sora e licença. tokens.json e tokens.css: valores e componentes de referência. index.html: guia visual local.'),
('Status da versão 1.0','Direção visual aprovada nesta conversa; geometria normalizada neste kit. O manual e o catálogo estão prontos para uso. O aplicativo atual ainda utiliza os tokens e o símbolo anteriores: a migração de produção é uma etapa separada.'),
('Checklist de adoção','Aplicar Logo.tsx e ícone PWA; carregar Sora localmente; mapear tokens antigos; revisar contrastes e estados; conferir login e navegação em ambos os temas; gerar favicons; atualizar screenshots; validar no celular antes da publicação.')])]

guidelines='# bid · Manual da marca e guidelines\n\nVersão 1.0 · 30 de outubro de 2026\n\n'
for num,label,title,blocks in SECTIONS:
    guidelines+=f'## {num} · {label}\n\n### {title}\n\n'
    for head,body in blocks: guidelines+=f'**{head}.** {body}\n\n'
guidelines+='## Referências\n\n- Sora e licença: https://github.com/google/fonts/tree/main/ofl/sora\n- WCAG 2.2: https://www.w3.org/TR/WCAG22/\n- Contraste: https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html\n\nAs proporções e mínimos da marca são regras deste projeto, não exigências externas. Os dados de proposta no catálogo são demonstrativos.\n'
(ROOT/'GUIDELINES.md').write_text(guidelines,encoding='utf-8')

# Paths are hand normalized from the approved concept, not text rendered with a substitute font.
class PdfPen(BasePen):
    def __init__(self,p): super().__init__(None); self.p=p
    def _moveTo(self,p): self.p.moveTo(*p)
    def _lineTo(self,p): self.p.lineTo(*p)
    def _curveToOne(self,a,b,c): self.p.curveTo(*a,*b,*c)
    def _closePath(self): self.p.close()
    def _endPath(self): pass

c=canvas.Canvas(str(PDF),pagesize=(960,680))
c.setTitle('bid · Manual da marca e design system · v1.0')
c.setAuthor('bid')
def rect(x,y,w,h,col,r=0):
    c.setFillColor(HexColor(col));c.setStrokeColor(HexColor(col))
    if r:c.roundRect(x,y,w,h,r,fill=1,stroke=0)
    else:c.rect(x,y,w,h,fill=1,stroke=0)
def txt(x,y,s,size=12,weight=400,color=INK):
    c.setFillColor(HexColor(color));c.setFont(f'Sora{weight}',size);c.drawString(x,y,s)
def para(x,y,text,w=390,size=11,color=INK):
    p=Paragraph(html.escape(text),ParagraphStyle('p',fontName='Sora400',fontSize=size,leading=size*1.55,textColor=HexColor(color)))
    _,height=p.wrap(w,500);p.drawOn(c,x,y-height);return height
def vector(path,x,y,scale,col):
    c.saveState();c.translate(x,y);c.scale(scale,-scale);c.setFillColor(HexColor(col));p=c.beginPath();parse_path(path,PdfPen(p));c.drawPath(p,fill=1,stroke=0,fillMode=0);c.restoreState()
def logo(x,y,w,col=INK,kind='horizontal'):
    s=w/(281 if kind=='horizontal' else 191 if kind=='wordmark' else 58)
    if kind=='horizontal':vector(MARK,x,y-15*s,s,col);vector(WORD,x+90*s,y,s,col)
    elif kind=='wordmark':vector(WORD,x,y,s,col)
    else:vector(MARK,x,y,s,col)
def page(num,label,title):
    rect(0,0,960,680,IVORY);txt(48,636,'bid / '+label,11,500);txt(48,558,title,30,600)
    rect(48,44,864,1,'#DCDDDF');txt(48,25,'MANUAL DA MARCA + DESIGN SYSTEM  /  V1.0  /  30.10.2026',8,500,'#626577');txt(885,25,f'{num:02d}',9,500)
def blocks(items,x=48,y=485,w=395):
    for head,body in items:
        txt(x,y,head,12,600);h=para(x,y-15,body,w,10.5);y-=h+46

# Cover.
rect(0,0,960,680,INK);txt(48,626,'IDENTIDADE VISUAL  /  2026',11,500,IVORY);logo(235,445,490,IVORY)
txt(48,130,'Manual da marca',32,500,IVORY);txt(48,88,'Guidelines e design system',18,400,IVORY);txt(780,48,'Versão 1.0',10,400,IVORY);c.showPage()
for idx,(num,label,title,items) in enumerate(SECTIONS,2):
    page(idx,label,title);blocks(items)
    x=500
    if num=='01':
        rect(x,155,412,325,INK,16);logo(x+60,365,292,IVORY);txt(x+32,205,'Propostas organizadas.',18,500,IVORY);txt(x+32,176,'Decisões bem informadas.',18,500,IVORY)
    elif num=='02':
        logo(x+20,450,360);rect(x,140,412,150,INK,12);logo(x+30,245,230,IVORY);logo(x+315,239,55,IVORY,'symbol')
    elif num=='03':
        s=1.15;xx=x+40;yy=435
        c.setStrokeColor(HexColor('#858899'));c.setDash(3,3);c.rect(xx-16*s,yy-113*s,313*s,131*s,stroke=1,fill=0);c.setDash()
        logo(xx,yy,281*s);txt(xx,260,'x = 16 unidades',11,500);para(xx,235,'Área tracejada: proteção mínima. A proporção e o intervalo entre os elementos são fixos.',330)
        logo(xx,150,112);logo(xx+205,150,24,kind='symbol')
    elif num=='04':
        rect(x,310,412,175,INK,12);logo(x+50,430,312,IVORY)
        rect(x,100,412,175,'#FFFFFF',12);logo(x+50,220,312,INK)
    elif num=='05':
        colors=[('Índigo',INK),('Marfim',IVORY),('Branco','#FFFFFF'),('Texto secundário','#626577'),('Sucesso','#236344'),('Atenção','#805315'),('Erro','#AA3038')]
        for k,(name,col) in enumerate(colors):
            yy=480-k*53;rect(x,yy-31,50,36,col,5);txt(x+64,yy-8,name,11,500);txt(x+270,yy-8,col,10,400)
    elif num=='06':
        txt(x,444,'Aa',76,500);txt(x,381,'Sora',28,600)
        for j,(s,weight) in enumerate([('Propostas organizadas',600),('Documentos e versões',500),('Clareza para comparar.',400)]): txt(x,325-j*43,s,20,weight)
        txt(x,155,'R$ 12.450,00',30,600);txt(x,119,'0123456789  /  ÁÉÍÓÚ  /  ã ç',15,400)
    elif num=='07':
        for j,v in enumerate([4,8,12,16,20,24,32,48,64]):
            yy=478-j*33;txt(x,yy-12,f'{v:02d}',10,500);rect(x+50,yy-17,v*4,16,INK,2)
        for j,r in enumerate([8,12,20]):rect(x+j*139,100,118,58,'#E9EBF4',r);txt(x+14+j*139,121,f'Raio {r}',11,500)
    elif num=='08':
        rect(x,426,230,48,INK,8);txt(x+20,444,'Adicionar proposta',12,600,IVORY)
        rect(x+247,426,165,48,'#FFFFFF',8);c.setStrokeColor(HexColor('#858899'));c.roundRect(x+247,426,165,48,8,stroke=1,fill=0);txt(x+270,444,'Comparar',12,600)
        txt(x,382,'Nome da proposta',11,600);rect(x,316,412,48,'#FFFFFF',8);c.setStrokeColor(HexColor('#858899'));c.roundRect(x,316,412,48,8,stroke=1,fill=0);txt(x+16,334,'Proposta de instalações',12,400)
        rect(x,110,412,170,'#FFFFFF',12);txt(x+24,244,'Fornecedor exemplo',15,600);txt(x+24,216,'Instalações · Obra exemplo',10,400,'#626577');txt(x+24,158,'R$ 12.450,00',22,600);txt(x+24,130,'Versão 02 · Em análise · Dados demonstrativos',9,400,'#626577')
    elif num=='09':
        rect(x,272,412,210,'#FFFFFF',12);logo(x+175,452,42,kind='symbol');txt(x+42,359,'Seu acervo começa aqui.',18,600);txt(x+42,326,'Adicione a primeira proposta.',12,400,'#626577')
        rect(x,126,412,110,'#FBECEF',12);txt(x+24,201,'Não foi possível enviar.',14,600,'#AA3038');txt(x+24,172,'Seu arquivo está preservado. Tente novamente.',10,400,'#AA3038')
    elif num=='10':
        for j,(name,fg,bg) in enumerate([('Texto principal',INK,IVORY),('Texto de apoio','#626577','#FFFFFF'),('Ação principal',IVORY,INK),('Sucesso','#236344','#E8F3EC')]):
            yy=480-j*83;rect(x,yy-62,412,65,bg,8);txt(x+20,yy-25,name,13,500,fg);txt(x+280,yy-25,f'{contrast(fg,bg):.2f}:1',17,600,fg)
        para(x,120,'Contrastes calculados. A conformidade final depende da implementação e da avaliação das telas.',400,10)
    else:
        rect(x,110,412,375,INK,12);txt(x+28,442,'Kit de implementação',20,500,IVORY)
        for j,s in enumerate(['13 arquivos SVG','Sora + licença OFL','Tokens JSON + CSS','Catálogo visual HTML','Relatório de contraste','Manual PDF + guidelines']):txt(x+28,390-j*44,s,13,400,IVORY)
    c.showPage()
page(13,'Referências','Fontes e manutenção.')
blocks([('Fonte Sora','Arquivos oficiais obtidos do repositório Google Fonts. A licença OFL acompanha a família. Os arquivos estáticos do kit foram instanciados da fonte variável para composição do manual.'),('Acessibilidade','Referência: WCAG 2.2 do W3C. O relatório local verifica os pares de contraste definidos nos tokens, não o comportamento integral do aplicativo.'),('Manutenção','Alterações de geometria exigem nova versão do kit. Novos componentes devem reutilizar tokens sem introduzir cores ou espaçamentos avulsos. Registrar decisões no repositório.')],w=400)
for j,(label,url) in enumerate([('Sora / Google Fonts','https://github.com/google/fonts/tree/main/ofl/sora'),('Licença OFL','https://github.com/google/fonts/blob/main/ofl/sora/OFL.txt'),('WCAG 2.2','https://www.w3.org/TR/WCAG22/'),('Contraste mínimo','https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html')]):
    yy=470-j*78;txt(500,yy,label,13,600);para(500,yy-16,url,400,9);c.linkURL(url,(500,yy-45,912,yy+14),relative=0)
c.save()

nav=''.join(f'<a href="#s{num}">{num} {html.escape(label)}</a>' for num,label,_,_ in SECTIONS)
sections=''
for num,label,title,items in SECTIONS:
    sections+=f'<section id="s{num}"><p class="eyebrow">{num} / {html.escape(label)}</p><h2>{html.escape(title)}</h2><div class="columns">'
    for head,body in items:sections+=f'<article><h3>{html.escape(head)}</h3><p>{html.escape(body)}</p></article>'
    sections+='</div>'
    if num=='02':sections+='<div class="brand-examples"><div>'+svg()+'</div><div class="inverse">'+svg(color=IVORY)+'</div><div class="app">'+svg('app')+'</div></div>'
    if num=='05':sections+='<div class="swatches">'+''.join(f'<div><span style="background:{v}"></span><b>{k}</b><code>{v}</code></div>' for k,v in list(light.items())[:10])+'</div>'
    if num=='06':sections+='<div class="type-sample">Propostas organizadas.<br><span>Clareza para decidir.</span></div>'
    if num=='08':sections+='''<div class="demo-grid"><div class="bid-card"><h3>Botões</h3><div class="row"><button class="bid-btn" id="saveDemo">Salvar proposta</button><button class="bid-btn secondary" id="resetDemo">Limpar exemplo</button><button class="bid-btn" disabled>Indisponível</button></div><p id="saveStatus" role="status" class="bid-help">Demonstração local, sem envio de dados.</p><div class="bid-field"><label for="proposalName">Nome da proposta</label><input id="proposalName" placeholder="Ex.: instalações elétricas" aria-describedby="fieldHelp"><span id="fieldHelp" class="bid-help">Nome usado para identificar o documento.</span></div></div><div class="bid-card"><h3>Fornecedor exemplo</h3><p>Instalações · Obra exemplo</p><p class="bid-num amount">R$ 12.450,00</p><div class="row"><span class="bid-badge warning">Em análise</span><span class="bid-badge success">Assinado</span><span class="bid-badge danger">Envio falhou</span></div><p class="bid-help">Versão 02 · Dados demonstrativos</p></div></div>'''
    if num=='10':
        sections+='<details><summary>Ver os 26 pares de contraste verificados</summary><div class="table-wrap"><table><thead><tr><th>Tema</th><th>Texto / fundo</th><th>Contraste</th><th>Mínimo</th></tr></thead><tbody>'+''.join(f'<tr><td>{v["theme"]}</td><td>{v["foreground"]} / {v["background"]}</td><td>{v["ratio"]}:1</td><td>{v["minimum"]}:1</td></tr>' for v in checks)+'</tbody></table></div></details>'
    sections+='</section>'
web='''<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>bid · Manual da marca e design system</title><link rel="stylesheet" href="tokens.css"><style>
html{scroll-behavior:smooth}body{margin:0}header{padding:24px max(24px,calc((100vw - 1160px)/2));display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid var(--bid-border);gap:20px}header svg{width:100px;fill:var(--bid-text)}main{max-width:1160px;margin:auto;padding:0 24px}h1{font-size:clamp(36px,6vw,72px);line-height:1.12;letter-spacing:-.04em;font-weight:600;max-width:850px;margin:24px 0}h2{font-size:clamp(28px,4vw,42px);line-height:1.2;font-weight:600;letter-spacing:-.035em}h3{font-size:17px;font-weight:600}p{color:var(--bid-muted)}.hero{padding:80px 0}.hero>p{max-width:640px}.eyebrow{font-size:12px;letter-spacing:.12em;text-transform:uppercase}.hero-logo{padding:60px 40px;background:var(--bid-surface);border-radius:20px;margin-top:40px;display:flex;justify-content:center}.hero-logo svg{width:min(570px,100%);fill:var(--bid-text)}nav{display:flex;flex-wrap:wrap;gap:8px 24px;padding-bottom:40px}nav a{min-height:44px;display:inline-flex;align-items:center;font-size:14px}section{padding:48px 0 64px;border-top:1px solid var(--bid-border);scroll-margin:16px}.columns{display:grid;grid-template-columns:repeat(3,1fr);gap:32px}.columns p{font-size:15px;line-height:1.75}.brand-examples{display:grid;grid-template-columns:2fr 2fr 1fr;gap:16px;margin-top:32px}.brand-examples>div{background:#F6F5F1;border-radius:12px;padding:40px 24px;display:flex;align-items:center;justify-content:center}.brand-examples .inverse{background:#171B31}.brand-examples svg{width:100%}.brand-examples .app{padding:20px}.swatches{display:grid;grid-template-columns:repeat(5,1fr);gap:16px;margin-top:32px}.swatches span{display:block;height:70px;border-radius:8px;border:1px solid var(--bid-control-border);margin-bottom:12px}.swatches b,.swatches code{display:block;font-size:12px}.type-sample{font-size:clamp(25px,4vw,46px);font-weight:600;padding:32px 0}.type-sample span{font-weight:400;color:var(--bid-muted)}.demo-grid{display:grid;grid-template-columns:1.2fr 1fr;gap:24px;margin-top:32px}.row{display:flex;flex-wrap:wrap;gap:12px}.amount{font-size:28px;color:var(--bid-text);font-weight:600}details{margin-top:24px}summary{cursor:pointer;padding:16px 0;min-height:44px}table{border-collapse:collapse;width:100%;font-size:14px}th,td{text-align:left;border-bottom:1px solid var(--bid-border);padding:12px}.table-wrap{overflow:auto}footer{padding:32px 0 64px;font-size:14px}.download{display:flex;flex-wrap:wrap;gap:12px}.skip{position:absolute;top:-80px;left:20px;background:var(--bid-surface);padding:12px}.skip:focus{top:10px;z-index:10}@media(max-width:760px){.columns,.demo-grid{grid-template-columns:1fr}.brand-examples{grid-template-columns:1fr}.brand-examples .app svg{width:120px}.swatches{grid-template-columns:repeat(2,1fr)}.hero{padding:48px 0}header{padding:20px}.bid-btn{white-space:normal}}@media(prefers-reduced-motion:reduce){html{scroll-behavior:auto}}@media print{header button,nav,.download{display:none}section{break-inside:avoid}body.bid-ds{background:white;color:#171B31}}
</style></head><body class="bid-ds" data-theme="light"><a class="skip" href="#content">Ir para o conteúdo</a><header>'''+svg()+'''<button class="bid-btn secondary" id="theme" aria-pressed="false">Ativar tema escuro</button></header><main id="content"><div class="hero"><p class="eyebrow">bid / Identidade visual / v1.0</p><h1>O essencial,<br>bem organizado.</h1><p>Manual da marca, guidelines e fundamentos do design system. Uma identidade precisa para organizar propostas e apoiar boas decisões.</p><div class="download"><a class="bid-btn" href="../../output/pdf/bid-manual-da-marca-v1.pdf">Abrir manual PDF</a><a class="bid-btn secondary" href="bid-brand-kit-v1.zip" download>Baixar kit da marca</a></div><div class="hero-logo">'''+svg()+'''</div></div><nav aria-label="Seções do manual">'''+nav+'</nav>'+sections+'''<footer><p>Versão 1.0 · 30 de outubro de 2026. Catálogo de referência; não altera o aplicativo de produção.</p><p>Fontes: <a href="https://github.com/google/fonts/tree/main/ofl/sora">Sora e licença OFL</a> · <a href="https://www.w3.org/TR/WCAG22/">WCAG 2.2</a></p><a href="GUIDELINES.md">Guidelines editáveis</a> · <a href="DESIGN-SYSTEM.md">Especificação de componentes</a> · <a href="tokens.json">Tokens JSON</a></footer></main><script>
const theme=document.getElementById('theme');theme.addEventListener('click',()=>{const dark=document.body.dataset.theme!=='dark';document.body.dataset.theme=dark?'dark':'light';theme.setAttribute('aria-pressed',String(dark));theme.textContent=dark?'Ativar tema claro':'Ativar tema escuro'});
const input=document.getElementById('proposalName'),status=document.getElementById('saveStatus'),help=document.getElementById('fieldHelp'),save=document.getElementById('saveDemo');let timer;
save.addEventListener('click',()=>{if(!input.value.trim()){input.setAttribute('aria-invalid','true');help.className='bid-error';help.textContent='Informe um nome para identificar a proposta.';input.focus();return}input.removeAttribute('aria-invalid');help.className='bid-help';help.textContent='Nome usado para identificar o documento.';save.disabled=true;save.setAttribute('aria-busy','true');save.textContent='Salvando…';status.textContent='Salvando exemplo local…';timer=setTimeout(()=>{save.disabled=false;save.removeAttribute('aria-busy');save.textContent='Salvar proposta';status.textContent='Exemplo concluído. Nenhum dado foi enviado ou armazenado.'},900)});
document.getElementById('resetDemo').addEventListener('click',()=>{clearTimeout(timer);input.value='';input.removeAttribute('aria-invalid');save.disabled=false;save.removeAttribute('aria-busy');save.textContent='Salvar proposta';help.className='bid-help';help.textContent='Nome usado para identificar o documento.';status.textContent='Demonstração local, sem envio de dados.';input.focus()});
</script></body></html>'''
(ROOT/'index.html').write_text(web,encoding='utf-8')
print(f'Created {PDF}; {len(checks)} contrast pairs pass; 13 SVGs; HTML guide.')

# Package preserves repository-relative links. Exclude its own archive.
archive=ROOT/'bid-brand-kit-v1.zip'
with zipfile.ZipFile(archive,'w',zipfile.ZIP_DEFLATED) as z:
    for file in ROOT.rglob('*'):
        if not file.is_file() or file==archive or '__pycache__' in file.parts: continue
        rel=file.relative_to(REPO).as_posix()
        if file.name=='index.html':
            content=file.read_text(encoding='utf-8').replace('href="bid-brand-kit-v1.zip" download>Baixar kit da marca','href="README.md">Arquivos do kit')
            z.writestr(rel,content)
        elif file.name=='README.md':
            content=file.read_text(encoding='utf-8').replace('- [Pacote para compartilhar](bid-brand-kit-v1.zip)\n','')
            z.writestr(rel,content)
        else:z.write(file,rel)
    z.write(PDF,PDF.relative_to(REPO).as_posix())
    z.writestr('LEIA-ME.txt','bid - Brand kit v1.0\nAbra docs/brand/index.html para navegar pelo guia.\nO manual está em output/pdf/bid-manual-da-marca-v1.pdf.\nVetores e PNGs: docs/brand/assets/. Fontes e licença: docs/brand/fonts/.\n')
print(f'Brand kit ZIP: {archive.stat().st_size:,} bytes')
