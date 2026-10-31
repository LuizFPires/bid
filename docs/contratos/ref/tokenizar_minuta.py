#!/usr/bin/env python3
"""
Gera o MODELO tokenizado da minuta padrão de empreitada para o bid.

Entrada : word/document.xml da minuta padrão JÁ com os campos marcados
          (etapa 1: tokenize.py — quadro, partes, planilha, datas).
Saída   : o mesmo XML com
          - cada item numerado (1.1., 3.2., 18.1.1. …) → {{cl:N.N}}
          - qualificação das partes → {{qual_ct}}, {{qual_cd}}, {{qual_cs}}
          - itens do Anexo II → {{decl_t:N}} (título em negrito) e {{decl:N}}
          - linha "Documentos integrantes" → {{q_documentos_integrantes}}
          - assinaturas → {{sig:contratante|contratada|construtora|declarante}}
          - seção nova "CONDIÇÕES ESPECÍFICAS" no Anexo I → {{blocos_anexo_i}}
          - página nova "ANEXO III" → {{anexo_iii_titulo}} / {{anexo_iii_texto}}
          e um catálogo JSON com o texto padrão de cada item (seed de contrato_modelos).

Uso: python3 tokenizar_minuta.py document.xml clausulas.json
"""
import json, re, sys
from xml.sax.saxutils import unescape

src, out_json = sys.argv[1], sys.argv[2]
x = open(src, encoding='utf-8').read()
PARA = re.compile(r'<w:p[ >].*?</w:p>', re.S)
T = re.compile(r'(<w:t(?: [^>]*)?>)([^<]*)(</w:t>)')
NUM = re.compile(r'^(\d+(?:\.\d+)+)\.\s*$')

def texts(p): return [m.group(2) for m in T.finditer(p)]
def set_texts(p, new):
    out, last, i = [], 0, 0
    for m in T.finditer(p):
        out.append(p[last:m.start()]); out.append('<w:t xml:space="preserve">' + new[i] + '</w:t>'); last = m.end(); i += 1
    out.append(p[last:]); return ''.join(out)

catalogo, titulo_atual, clausula_atual = [], None, None
decl = []
cont = {'cl': 0, 'decl': 0, 'qual': 0, 'sig': 0}
SIG = {'— CONTRATANTE': 'contratante', '— CONTRATADA': 'contratada', '— CONSTRUTORA': 'construtora'}

def handle(m):
    global titulo_atual, clausula_atual
    p = m.group(0); ts = texts(p); s = unescape(''.join(ts)).strip()
    if not ts: return p
    h = re.match(r'^CLÁUSULA (.+?) – (.+)$', s)
    if h:
        clausula_atual = {'clausula': h.group(1), 'titulo': h.group(2), 'itens': []}
        catalogo.append(clausula_atual); return p
    # item numerado: número no 1º texto (ou 1º + espaço no 2º)
    if len(ts) > 1 and re.match(r'^\d+(\.\d+)+$', ts[0]) and ts[1].startswith('. '):
        ts = [ts[0] + '. ', ts[1][2:]] + ts[2:]   # número partido em dois runs ("19.3.2" + ". texto")
    first = unescape(ts[0])
    mnum = NUM.match(first) or (NUM.match(first + ts[1]) if len(ts) > 1 and ts[1].strip() == '' else None)
    if mnum and clausula_atual is not None:
        n = mnum.group(1)
        k = 1 if NUM.match(first) else 2
        corpo = unescape(''.join(ts[k:])).strip()
        clausula_atual['itens'].append({'numero': n, 'texto': corpo})
        new = ts[:k] + ['{{cl:%s}}' % n] + [''] * (len(ts) - k - 1)
        cont['cl'] += 1
        return set_texts(p, new)
    for rot, key in (('I. CONTRATANTE: ', 'ct'), ('II. CONTRATADA: ', 'cd'), ('III. CONSTRUTORA: ', 'cs')):
        if ts[0] == rot:
            cont['qual'] += 1
            return set_texts(p, [ts[0], '{{qual_%s}}' % key] + ts[2:])
    md = re.match(r'^(\d)\. $', ts[0])
    if md and len(ts) >= 3 and ts[1].endswith('. '):
        n = md.group(1); decl.append({'numero': n, 'titulo': unescape(ts[1]).strip(), 'texto': unescape(''.join(ts[2:])).strip()})
        cont['decl'] += 1
        return set_texts(p, [ts[0], '{{decl_t:%s}} ' % n, '{{decl:%s}}' % n] + [''] * (len(ts) - 3))
    if s.startswith('ANEXO I — Condições Particulares') and 'Declaração' in s:
        return set_texts(p, ['{{q_documentos_integrantes}}'] + [''] * (len(ts) - 1))
    for suf, key in SIG.items():
        if s.endswith(suf) and '{{' in s:
            cont['sig'] += 1
            return set_texts(p, ['{{sig:%s}}' % key] + [''] * (len(ts) - 1))
    if s.startswith('{{cd_razao}} — {{decl_nome}}'):
        cont['sig'] += 1
        return set_texts(p, ['{{sig:declarante}}'] + [''] * (len(ts) - 1))
    return p

x = PARA.sub(handle, x)

# --- seção CONDIÇÕES ESPECÍFICAS no Anexo I (antes de "As partes confirmam") ---
paras = list(PARA.finditer(x))
def ptxt(p): return unescape(''.join(texts(p))).strip()
esc = next(m for m in paras if ptxt(m.group(0)) == 'ESCOPO, PREÇOS E INTERFACES').group(0)
item = next(m for m in paras if '{{decl:1}}' in m.group(0)).group(0)
conf = next(m for m in paras if ptxt(m.group(0)).startswith('As partes confirmam e aceitam as condições deste ANEXO I'))
def so_texto(p, t):
    ts = texts(p); return set_texts(p, [t] + [''] * (len(ts) - 1))
strip_ids = lambda p: re.sub(r' w14:(paraId|textId)="[^"]*"', '', p)
cabec = strip_ids(so_texto(esc, 'CONDIÇÕES ESPECÍFICAS'))
corpo_blocos = strip_ids(so_texto(item, '{{blocos_anexo_i}}'))
x = x[:conf.start()] + cabec + corpo_blocos + x[conf.start():]

# --- ANEXO III (proposta) no fim do documento ---
paras = list(PARA.finditer(x))
an2 = next(m for m in paras if ptxt(m.group(0)).startswith('ANEXO II – DECLARAÇÃO')).group(0)
quebra = '<w:p><w:r><w:br w:type="page"/></w:r></w:p>'
anexo3 = quebra + strip_ids(so_texto(an2, '{{anexo_iii_titulo}}')) + strip_ids(so_texto(item, '{{anexo_iii_texto}}'))
i = x.rfind('<w:sectPr')
x = x[:i] + anexo3 + x[i:]

# fecho: a lista de anexos muda quando há Anexo III
x = x.replace('presente instrumento e os ANEXOS I e II, na presença', 'presente instrumento e os {{anexos_lista}}, na presença', 1)

open(src, 'w', encoding='utf-8').write(x)
json.dump({'versao': '1.0', 'origem': 'Contrato_Empreitada_FINAL_padrão.docx (27/10/2026)',
           'clausulas': catalogo, 'anexo_ii': decl}, open(out_json, 'w', encoding='utf-8'), ensure_ascii=False, indent=2)
print(cont, 'clausulas', len(catalogo), 'itens', sum(len(c['itens']) for c in catalogo), 'decl', len(decl))
print('restam tokens antigos de partes:', sorted(set(re.findall(r'\{\{([a-z_]+)\}\}', x))))
