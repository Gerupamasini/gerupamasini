// 図鑑データ
export const SPECIES = {
  kometsuki: {
    name: 'コメツキガニ',
    sci: 'Scopimera globosa',
    size: '甲幅 約1cm',
    color: '#c9b08a',
    text: '砂の多い干潟に巣穴を掘ってくらす小さなカニ。はさみで砂をすくい、表面の珪藻やデトリタスをこし取って食べ、残った砂を丸めた「砂団子」を巣穴のまわりに並べます。潮が満ちると巣穴に入り、穴をふさいで空気をためてじっと待ちます。',
  },
  yamato: {
    name: 'ヤマトオサガニ',
    sci: 'Macrophthalmus japonicus',
    size: '甲幅 約3.5cm',
    color: '#8f8a6a',
    text: '横長の四角い甲羅と、長い眼柄（がんぺい）が特徴。泥っぽい干潟にすみ、潮が引くと巣穴から出て泥の表面を食べます。オスは大きなはさみを振り上げる「ウェービング」でなわばりや求愛をアピールします。',
  },
  sunamogri: {
    name: 'ニホンスナモグリ',
    sci: 'Nihonotrypaea japonica',
    size: '体長 約4cm',
    color: '#e9c3b4',
    text: '干潟の地下深くまでY字型の巣穴を掘る、エビに近い仲間。からだは半透明の白〜淡いピンク。巣穴から砂を押し出すため、入口に小さな砂の山（マウンド）ができます。満潮時、ときどき入口まで上がってきます。',
  },
  mahaze: {
    name: 'マハゼ（稚魚）',
    sci: 'Acanthogobius flavimanus',
    size: '全長 約2〜3cm',
    color: '#b89f74',
    text: '東京湾の干潟を代表するハゼ。春に生まれた稚魚は干潟の浅瀬や澪筋で群れて育ち、秋には「ハゼ釣り」の対象になります。潮が引くと水の残る澪筋や潮だまりへ移動します。',
  },
  himehaze: {
    name: 'ヒメハゼ（稚魚）',
    sci: 'Favonigobius gymnauchen',
    size: '全長 約2cm',
    color: '#d8ccb0',
    text: '砂底にぴたりと着底し、砂にまぎれる淡い体色と点列模様で身を隠すハゼ。じっと止まっては、ぴょんと短く泳いで移動します。',
  },
  yadokari: {
    name: 'ユビナガホンヤドカリ',
    sci: 'Pagurus minutus',
    size: '甲長 約1cm',
    color: '#7a5a48',
    text: '東京湾の干潟でもっともよく見られるヤドカリ。ウミニナやアラムシロガイなどの巻貝の殻を借りて背負い、干潮時も潮だまりの周りを歩き回ります。成長すると大きな殻に引っ越します。',
  },
  arumushiro: {
    name: 'アラムシロガイ',
    sci: 'Reticunassa festiva',
    size: '殻高 約1.5cm',
    color: '#a39070',
    text: '粗い網目状の彫刻をもつ小さな巻貝。死んだ魚や貝などのにおいを水管で敏感にかぎつけ、たくさんの個体が集まってくる「干潟の掃除屋」です。',
  },
  asari: {
    name: 'アサリ',
    sci: 'Ruditapes philippinarum',
    size: '殻長 約4cm',
    color: '#9a8f86',
    text: '砂の中に浅く潜り、2本の水管だけを地表に出して海水を吸い込み、植物プランクトンをこし取って食べます。殻の模様は1個体ごとにちがい、同じ模様はほとんどありません。水をろ過して干潟の水質浄化にも役立っています。',
  },
  mategai: {
    name: 'マテガイ',
    sci: 'Solen strictus',
    size: '殻長 約10cm',
    color: '#c9a86a',
    text: '細長い筒のような二枚貝。砂の中に垂直に深く潜り、地表には「8の字」や鍵穴形の小さな穴が残ります。穴に塩を入れると、驚いて勢いよく飛び出してくることで有名です。',
  },
};

export const ORDER = ['kometsuki', 'yamato', 'sunamogri', 'mahaze', 'himehaze', 'yadokari', 'arumushiro', 'asari', 'mategai'];
