"""Build the expansion data files from the 100x20 apple matrix + drafted apple details.

    python3 scripts/build_content_data.py

Inputs
  src/data/source/apple_matrix_100x20.csv   fit stars 0-3 for 100 apples x 20 recipes (authoritative)
  src/data/prototype_game_data.json         the 10 researched prototype apples (kept as-is)
  src/data/source/apple_unlock_cards.md     researched one-line overview + game unlock order per apple
  DRAFTS below                              provisional stats / size / visuals for the other 90 apples

Outputs
  src/data/apples_expansion.json   90 new apples (prototype field names) + 100-apple unlock order
  src/data/apple_visuals.json      skin / flesh / size visuals for all 100 apples (game + Blender icons)
  src/data/fit_matrix.json         the CSV as JSON

Overviews and unlock order come from the unlock cards. DRAFTS supply provisional 1-5 stats, size
class, flesh colour and skin visuals written from general variety knowledge, not researched values. Every drafted apple carries "provisional": true. Replace them with
researched data when available and re-run this script.
"""
import csv
import json
import os
import re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, 'src', 'data')

# Skin presets: (base, second, pattern). base = dominant colour; for 'streak', second is the
# ground colour showing between stripes; for 'blush', second is the blush/ground tone.
SKINS = {
    'Y': ('#F0CF55', '#E2BC45', 'solid'),     # golden yellow
    'YG': ('#D3D25E', '#E6DD7C', 'solid'),    # yellow-green
    'G': ('#9DBF4E', '#BBD26C', 'solid'),     # green
    'YB': ('#F2CC4E', '#F0A060', 'blush'),    # yellow with rosy blush
    'RB': ('#D9503F', '#E9C25A', 'blush'),    # red over yellow
    'RS': ('#D9473A', '#F2B35A', 'streak'),   # red stripes over yellow
    'RR': ('#D2342E', '#B02428', 'solid'),    # bright red
    'DR': ('#9C1828', '#6E0E1A', 'solid'),    # deep red
    'PK': ('#E8606A', '#F2C060', 'blush'),    # pink
    'GR': ('#D6AA48', '#B8893A', 'solid'),    # gold russet
}
PINK_FLESH = '#F29AA6'

# id: (kid line, sweet, tart, juicy, crunchy, smell, size, skin, flesh_red, heat)
DRAFTS = {
    'a001': ('Golden-yellow apple that is sweet and juicy.', 4, 2, 4, 3, 3, 'standard', 'GR', False, None),
    'a002': ('Yellow "Venus" apple with a sweet, mellow taste.', 4, 2, 4, 3, 4, 'standard', 'Y', False, None),
    'a003': ('Bright yellow apple, very sweet, often with a honey centre.', 5, 1, 4, 3, 4, 'standard', 'Y', False, None),
    'a004': ('Yellow apple from Hirosaki with a sweet-tart bite.', 3, 3, 3, 4, 3, 'large', 'YG', False, None),
    'a005': ('Big yellow apple, sweet and very juicy.', 4, 2, 5, 3, 3, 'large', 'Y', False, None),
    'a007': ('Famous golden apple, sweet with a soft crunch.', 4, 2, 3, 3, 4, 'standard', 'Y', False, 'softens'),
    'a008': ('Yellow apple with a fresh sweet-tart taste.', 3, 3, 3, 3, 3, 'standard', 'YG', False, None),
    'a009': ('Yellow apple with a gentle, sweet taste.', 4, 2, 3, 3, 3, 'standard', 'Y', False, None),
    'a010': ('"Star gold coin" - a crisp yellow apple.', 4, 2, 3, 4, 3, 'standard', 'Y', False, None),
    'a011': ('Large yellow-green apple, juicy with a fresh smell.', 4, 2, 4, 3, 4, 'large', 'YG', False, None),
    'a012': ('Yellow apple that is sweet and soft.', 4, 1, 3, 2, 3, 'standard', 'Y', False, None),
    'a013': ('Yellow apple with sweet juice and a light tang.', 4, 2, 4, 3, 3, 'standard', 'YG', False, None),
    'a014': ('"Shining forest" - a juicy yellow-green Aomori apple.', 4, 2, 4, 3, 3, 'standard', 'YG', False, None),
    'a015': ('Yellow apple that is sweet with hardly any sourness.', 4, 1, 4, 3, 3, 'standard', 'Y', False, None),
    'a016': ('Yellow Aomori apple, sweet and crunchy.', 4, 2, 4, 4, 3, 'standard', 'Y', False, None),
    'a017': ('Yellow apple with a rosy blush and a honey centre.', 5, 1, 4, 3, 4, 'standard', 'YB', False, None),
    'a018': ('Golden apple that is very sweet and mild.', 5, 1, 3, 3, 3, 'standard', 'Y', False, None),
    'a019': ('Golden cousin of Fuji, sweet and crisp.', 4, 2, 3, 4, 3, 'standard', 'Y', False, None),
    'a020': ('Golden apple with a lively sweet-tart taste.', 4, 3, 4, 4, 3, 'standard', 'Y', False, 'retains_shape'),
    'a021': ('Small apple with rosy pink flesh inside!', 3, 4, 3, 3, 3, 'standard', 'Y', True, None),
    'a022': ('Yellow apple with a sweet, fresh flavour.', 3, 2, 3, 3, 3, 'standard', 'Y', False, None),
    'a024': ('Yellow apple with a sweet, melon-like smell.', 4, 1, 3, 2, 4, 'standard', 'YG', False, None),
    'a025': ('Green-yellow Aomori apple, sweet and gentle.', 4, 1, 3, 3, 3, 'standard', 'YG', False, None),
    'a026': ('Yellow apple with a soft, sweet, fragrant taste.', 4, 1, 3, 3, 4, 'standard', 'Y', False, None),
    'a027': ('Yellow apple with a sweet-tart, crisp bite.', 3, 3, 3, 4, 3, 'standard', 'Y', False, None),
    'a028': ('Bright green apple, crunchy and very tart.', 2, 5, 3, 5, 2, 'standard', 'G', False, 'retains_shape'),
    'a029': ('Early summer green apple, light and tangy.', 2, 4, 3, 2, 3, 'small', 'G', False, None),
    'a030': ('Green summer apple, fresh and tangy.', 3, 3, 3, 3, 3, 'small', 'G', False, None),
    'a031': ('Green apple with a fresh, sour crunch.', 2, 4, 3, 4, 3, 'standard', 'G', False, None),
    'a033': ('Red apple with a sweet, juicy bite.', 4, 2, 4, 3, 3, 'standard', 'RB', False, None),
    'a034': ('Small red apple, very sweet with a honey centre.', 5, 1, 3, 4, 4, 'small', 'RB', False, None),
    'a035': ('Small, tall red apple - easy to hold!', 4, 2, 3, 4, 3, 'small', 'RR', False, None),
    'a036': ('Early red apple, sweet and juicy.', 4, 2, 4, 3, 3, 'standard', 'RS', False, None),
    'a037': ('Red apple with a sweet-tart flavour.', 3, 3, 3, 3, 3, 'standard', 'RB', False, None),
    'a038': ('Early red apple, sweet and crisp.', 4, 2, 3, 4, 3, 'standard', 'RB', False, None),
    'a039': ('Summer red apple with a light, fresh taste.', 3, 3, 3, 3, 3, 'standard', 'RR', False, None),
    'a040': ('Sun-grown Fuji: extra sweet and juicy.', 5, 2, 4, 4, 4, 'standard', 'RS', False, None),
    'a041': ('Red apple that is sweet and juicy.', 4, 2, 4, 3, 3, 'standard', 'RB', False, None),
    'a042': ('Red apple with a ruby-pink blush inside.', 4, 3, 3, 3, 3, 'standard', 'RR', True, None),
    'a043': ('Old-time small apple, tangy and firm.', 3, 3, 3, 4, 3, 'small', 'RS', False, None),
    'a044': ('"Number one in the world" - a giant apple!', 3, 2, 4, 2, 3, 'large', 'RB', False, None),
    'a045': ('Red apple that is extra sweet and juicy.', 5, 1, 4, 3, 3, 'standard', 'RS', False, None),
    'a046': ('Red apple with a rich sweet-tart taste.', 4, 3, 3, 4, 3, 'standard', 'RS', False, None),
    'a047': ('Bright red apple with a fresh sweet-tart taste.', 4, 3, 3, 3, 3, 'standard', 'RR', False, None),
    'a049': ('Red apple from Akita, sweet with a honey centre.', 5, 1, 3, 3, 3, 'standard', 'RR', False, None),
    'a050': ('Green-yellow apple that is sweet with no sourness.', 4, 1, 2, 3, 4, 'standard', 'YG', False, None),
    'a051': ('Big green-yellow apple, juicy and crisp.', 4, 2, 4, 3, 3, 'large', 'YG', False, None),
    'a052': ('Pink apple with a zingy, crunchy bite.', 3, 4, 3, 5, 3, 'small', 'PK', False, 'retains_shape'),
    'a053': ('A Fuji relative: red, sweet and juicy.', 4, 2, 4, 4, 3, 'standard', 'RS', False, None),
    'a054': ('Early Fuji from Hirosaki, sweet and mild.', 4, 1, 3, 3, 3, 'standard', 'RS', False, None),
    'a055': ('Red apple with a gentle, sweet flavour.', 4, 2, 3, 3, 3, 'standard', 'RB', False, None),
    'a056': ('Early Fuji-type apple, sweet and crisp.', 4, 1, 3, 4, 3, 'standard', 'RS', False, None),
    'a057': ('Red apple, sweet with a soft crunch.', 4, 1, 3, 3, 3, 'standard', 'RB', False, None),
    'a059': ('Huge deep-red apple - a real giant!', 3, 3, 3, 3, 3, 'large', 'DR', False, None),
    'a060': ('Red apple that is sweet and mellow.', 4, 1, 3, 3, 3, 'standard', 'RR', False, None),
    'a061': ('Red apple with a sweet and tangy taste.', 4, 3, 3, 3, 3, 'standard', 'RS', False, None),
    'a062': ('Autumn red apple with a firm, tangy bite.', 3, 3, 3, 4, 3, 'standard', 'RR', False, None),
    'a063': ('Red apple with lots of sweet-tart juice.', 3, 3, 4, 3, 3, 'standard', 'RS', False, None),
    'a064': ('Red apple with a sweet, crisp bite.', 4, 2, 3, 4, 3, 'standard', 'RR', False, None),
    'a065': ('Red Aomori apple, sweet-tart and juicy.', 4, 3, 4, 4, 3, 'standard', 'RS', False, None),
    'a067': ('Big red apple, juicy with a honey centre.', 5, 2, 5, 3, 4, 'large', 'RS', False, None),
    'a068': ('Large red apple with a lovely sweet smell.', 4, 1, 3, 3, 4, 'large', 'RB', False, None),
    'a069': ('Bright red apple with a sharp, tangy taste.', 2, 4, 3, 3, 3, 'small', 'RR', False, 'retains_shape'),
    'a070': ('Red apple with a rich sweet-tart taste.', 4, 3, 3, 4, 3, 'standard', 'RS', False, None),
    'a071': ('Red apple, sweet and juicy.', 4, 1, 4, 3, 3, 'standard', 'RB', False, None),
    'a072': ('Red apple with a firm, sweet-tart bite.', 3, 3, 3, 4, 3, 'standard', 'RR', False, None),
    'a073': ('Red apple with a fresh sweet-tart taste.', 4, 3, 3, 3, 3, 'standard', 'RB', False, None),
    'a074': ('Red apple with a mild, sweet taste.', 4, 2, 3, 3, 3, 'standard', 'RB', False, None),
    'a075': ('Old red apple with a strong, fruity smell.', 3, 4, 4, 2, 5, 'standard', 'DR', False, 'softens'),
    'a076': ('Bright red early apple, sweet and juicy.', 4, 2, 4, 3, 3, 'standard', 'RR', False, None),
    'a077': ('Small striped red apple, sweet-tart.', 3, 3, 3, 3, 3, 'small', 'RS', False, None),
    'a078': ('Early red apple with a cool, fresh taste.', 4, 2, 3, 3, 3, 'large', 'RB', False, None),
    'a079': ('A redder Jonagold - sweet-tart and juicy.', 4, 3, 4, 3, 3, 'standard', 'RB', False, None),
    'a080': ('Early red apple with a tangy crunch.', 3, 3, 3, 3, 3, 'standard', 'RR', False, None),
    'a082': ('Red apple with a sweet, gentle flavour.', 4, 2, 3, 3, 3, 'standard', 'RB', False, None),
    'a083': ('Red apple with a sweet-tart taste.', 3, 3, 3, 3, 3, 'standard', 'RS', False, None),
    'a084': ('Small red apple, sweet-tart and juicy.', 4, 3, 4, 3, 3, 'small', 'RR', False, None),
    'a085': ('Deep red apple, sweet and crisp.', 4, 2, 3, 4, 3, 'standard', 'DR', False, None),
    'a087': ('Red-gold apple with a sweet, fruity taste.', 4, 2, 3, 3, 3, 'standard', 'DR', False, None),
    'a088': ('Red and yellow apple, sweet and mild.', 4, 1, 3, 2, 3, 'standard', 'RB', False, None),
    'a089': ('Red apple, sweet and very juicy.', 4, 2, 4, 3, 3, 'large', 'RB', False, None),
    'a090': ('Red apple with pretty pink-red flesh.', 3, 3, 3, 3, 3, 'standard', 'DR', True, None),
    'a092': ('Tall deep-red apple, sweet and fragrant.', 4, 1, 3, 3, 4, 'standard', 'DR', False, None),
    'a093': ('A mystery apple known only by a number!', 4, 2, 3, 3, 3, 'standard', 'RB', False, None),
    'a095': ('Red-yellow apple with a sweet, fresh taste.', 4, 2, 3, 3, 3, 'standard', 'RB', False, None),
    'a096': ('Aomori red apple, sweet and juicy.', 4, 2, 4, 4, 3, 'large', 'RS', False, None),
    'a097': ('Early red apple, sweet with a light tang.', 4, 2, 3, 3, 3, 'standard', 'RR', False, None),
    'a098': ('Early Jonagold relative, sweet-tart.', 4, 3, 3, 3, 3, 'standard', 'RB', False, None),
    'a099': ('Big red apple, sweet and juicy.', 4, 2, 4, 3, 3, 'large', 'DR', False, None),
    'a100': ('Dark red autumn apple, sweet and rich.', 4, 2, 3, 4, 3, 'standard', 'DR', False, None),
}

# The 10 prototype apples keep their researched data and visuals (mirrors content.ts / previews.py).
PROTO_VISUALS = {
    'a048': {'skin': {'base': '#D9473A', 'second': '#F2B35A', 'pattern': 'streak'}},
    'a081': {'skin': {'base': '#D9503F', 'second': '#E9C25A', 'pattern': 'blush'}},
    'a023': {'skin': {'base': '#C9C85A', 'second': '#E3D873', 'pattern': 'solid'}},
    'a066': {'skin': {'base': '#E0603C', 'second': '#F0C04A', 'pattern': 'blush'}},
    'a006': {'skin': {'base': '#F2CC4E', 'second': '#F0A060', 'pattern': 'blush'}},
    'a094': {'skin': {'base': '#B3202A', 'second': '#8E1520', 'pattern': 'solid'}},
    'a091': {'skin': {'base': '#D93A33', 'second': '#F2B35A', 'pattern': 'blush'}},
    'a032': {'skin': {'base': '#8DB54A', 'second': '#B7CF68', 'pattern': 'solid'}, 'scale': 1.12},
    'a058': {'skin': {'base': '#A8182A', 'second': '#7E0F1E', 'pattern': 'solid'}, 'flesh': PINK_FLESH},
    'a086': {'skin': {'base': '#CF3A3A', 'second': '#E8B850', 'pattern': 'streak'}},
}

# Unlock order. The prototype schedule is kept (5 starters; Kogyoku after order 3, Alps Otome 6,
# Bramley 9, Kurenai no Yume 12, Chiyuki 15). Every other completed order delivers one new apple,
# taken from this list in turn: a curated opening run, then the rest in poster order.
STARTERS = ['a048', 'a081', 'a023', 'a066', 'a006']
PROTO_FIXED = {3: 'a094', 6: 'a091', 9: 'a032', 12: 'a058', 15: 'a086'}
CARD_RE = re.compile(r'## (\d{3}): (.+?) / (.+?)\n\n(.+?)\n\n\[Apple evidence\]\((.+?)\) · Game unlock (\d+) · Delivery tier (\d+)')


def read_cards():
    text = open(os.path.join(DATA, 'source', 'apple_unlock_cards.md'), encoding='utf-8').read()
    cards = {}
    for idx, en, ja, body, url, unlock, tier in CARD_RE.findall(text):
        cards['a' + idx] = {'overview': body.split(' Try ')[0].strip(), 'url': url, 'unlock': int(unlock), 'tier': int(tier)}
    assert len(cards) == 100, len(cards)
    return cards


def main():
    proto = json.load(open(os.path.join(DATA, 'prototype_game_data.json'), encoding='utf-8'))
    rows = list(csv.DictReader(open(os.path.join(DATA, 'source', 'apple_matrix_100x20.csv'), encoding='utf-8-sig')))
    recipe_cols = list(rows[0].keys())[4:]
    assert len(rows) == 100 and len(recipe_cols) == 20, (len(rows), len(recipe_cols))
    by_id = {r['apple_id']: r for r in rows}
    proto_ids = {a['id'] for a in proto['apples']}
    assert proto_ids <= set(by_id), proto_ids - set(by_id)
    assert set(DRAFTS) == set(by_id) - proto_ids, sorted((set(by_id) - proto_ids) ^ set(DRAFTS))
    for p in proto['pairings']:
        assert int(by_id[p['apple_id']][p['recipe_id']]) == p['fit_stars'], p

    # fit matrix
    matrix = {
        'schema_version': '1.0',
        'source': 'src/data/source/apple_matrix_100x20.csv',
        'recipes': recipe_cols,
        'apples': {r['apple_id']: [int(r[c]) for c in recipe_cols] for r in rows},
    }
    for aid, v in matrix['apples'].items():
        assert all(0 <= x <= 3 for x in v), aid

    cards = read_cards()
    # unlock order: new apples in the cards' researched game-unlock order
    queue = sorted((r['apple_id'] for r in rows if r['apple_id'] not in proto_ids), key=lambda a: cards[a]['unlock'])
    order = list(STARTERS)
    at = 1
    unlocks = [{'at': 0, 'ids': list(STARTERS)}]
    while queue or at in PROTO_FIXED:
        aid = PROTO_FIXED[at] if at in PROTO_FIXED else queue.pop(0)
        order.append(aid)
        unlocks.append({'at': at, 'ids': [aid]})
        at += 1
    assert len(order) == 100 and len(set(order)) == 100

    # apples + visuals
    apples = []
    visuals = dict(PROTO_VISUALS)
    for r in rows:
        aid = r['apple_id']
        if aid in proto_ids:
            continue
        line, sw, ta, ju, fi, ar, size, skin, red, heat = DRAFTS[aid]
        apples.append({
            'id': aid,
            'poster_index': int(r['poster_index']),
            'name_ja': r['apple_ja'],
            'name_en': r['apple_en'],
            'overview_for_kids': cards[aid]['overview'],
            'source_url': cards[aid]['url'],
            'game_delivery_tier': cards[aid]['tier'],
            'game_size_class': size,
            'flesh_color': 'pink_or_red' if red else 'cream',
            'browning_behavior': None,
            'heat_behavior': {'value': heat, 'status': 'provisional'} if heat else None,
            'game_stats_1to5': {'sweetness': sw, 'tartness': ta, 'juiciness': ju, 'raw_firmness': fi, 'aroma': ar},
            'provisional': True,
        })
        b, s, pat = SKINS[skin]
        v = {'skin': {'base': b, 'second': s, 'pattern': pat}}
        if red:
            v['flesh'] = PINK_FLESH
        visuals[aid] = v

    out = {
        'schema_version': '1.0',
        'note': 'Names and fit scores from the 100x20 matrix; overviews and unlock order from the unlock cards. '
                'Stats, size and flesh colour are provisional drafts. Generated by scripts/build_content_data.py.',
        'unlock_order': order,
        'apple_unlocks': unlocks,
        'apples': apples,
    }
    json.dump(out, open(os.path.join(DATA, 'apples_expansion.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    json.dump({k: visuals[k] for k in order}, open(os.path.join(DATA, 'apple_visuals.json'), 'w', encoding='utf-8'), indent=1)
    json.dump(matrix, open(os.path.join(DATA, 'fit_matrix.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print('apples', len(apples), '+', len(proto_ids), '| unlocks', len(unlocks), 'last at', unlocks[-1]['at'])


if __name__ == '__main__':
    main()
