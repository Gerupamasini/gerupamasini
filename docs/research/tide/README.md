# 潮汐データと検証

TICON-4の東京・横須賀の調和定数を、@neaps/tide-database 0.10.20260924経由で取得。元データのスナップショットはこのディレクトリのJSON。気象庁・海上保安庁による潮位観測から求められた定数を使用し、東京から横須賀の振幅を推測する旧処理を置き換えた。

Hart-Davis, Michael; Dettmering, Denise; Seitz, Florian (2025). *TICON-4: TIdal CONstants based on GESLA-4 sea-level records.* SEANOE. https://doi.org/10.17882/109129 。CC BY 4.0（https://creativecommons.org/licenses/by/4.0/）。Neaps tide database: https://github.com/openwatersio/tide-database 。各スナップショットにも出典・ライセンス・元プロジェクトの変更点を記載。

スナップショットの付随する位置情報の出典：GeoNames（https://www.geonames.org/、CC BY 4.0）、OpenStreetMap contributors（https://www.openstreetmap.org/copyright、ODbL 1.0）、Marine Regions / Flanders Marine Institute（https://www.marineregions.org/、CC BY 4.0）。ゲームが使うのは観測所の座標と調和定数です。

ゲーム向けの変更：名称を既存の分潮定義に合わせ、振幅をmからcmへ変換。未対応の微小分潮を省略。UTC位相をそのまま使用。観測所のゼロと海図基準面の対応を推定せず、ゲームは平均海面を0cmとする。再生成は `node tools/tide/import-ticon.mjs`（Node 24）。

名称の対応は大文字・小文字に加えて、SGM→sigma1、EP2→MNS2（eps2と同じ227.655の引数・27.4238338°/h）。定義は https://github.com/openwatersio/slackwater/blob/main/packages/engine/src/constituents/data.json も参照。

検証用の東京2020年公式潮位表は、MITのJMATidesリポジトリに保管された気象庁のデータから、1・4・7・10月の1・8・15・22日を抽出。

- 公式表：https://www.data.jma.go.jp/kaiyou/data/db/tide/suisan/txt/2020/TK.txt
- 取得元：https://github.com/ngs/jma-tides-swift/blob/master/Tests/Fixtures/TK.txt
- テスト：`tests/unit/tideReference.test.ts`

384点の毎時潮位は日ごとの平均を除いて比較する。基準面の差・季節平均海面を未検証の数値で埋めない。干潮時刻も公式の記載と比較し、平均6分以内・最大20分以内をテストする。これは当該16日における確認で、全ての年・地点の誤差保証ではない。横須賀の公式表との照合、気象による潮位変動の再現は未実施。任意日付のチケット・カレンダーは維持。
