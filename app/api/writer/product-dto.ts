/** app/api/writer/product-dto.ts
 * Phase3-P3-3/P3-6: ProductContext → Precision DTO（LLM 向け安全ペイロード）
 *
 * 目的:
 * - DB や内部の ProductContext から、LLM に渡す JSON の shape を型として固定する
 * - LLM に渡してよい情報だけを明示し、内部 ID や機密情報はここに載せない
 * - Vitest で shape / mapping を保証するための「単一の公式型定義」を用意する
 *
 * 注意:
 * - このファイルは「型定義のみ」を扱う。変換ロジックは別ファイルで実装する（P3-3-2 以降）。
 * - ここで定義した DTO は、/api/writer の Precision Prompt Engine から直接参照されることを想定する。
 * - P3-6 では、PRODUCT_FACTS ブロックで利用するための「facts 用 DTO（items スロット）」の
 *   受け皿だけを追加し、実データの注入は後続フェーズ（P3-7）で行う。
 */

/** ====== 基本 ID / ステータス型 ====== */

/**
 * LLM 向けに公開してよい範囲の「商品識別子」。
 * - 内部の DB 主キーなどはここに直接出さない前提で、あくまで外部公開してよい ID を指す。
 * - 今は string として定義し、実際にどの値を載せるかは変換レイヤー側で制御する。
 */
export type PrecisionProductId = string;

/**
 * ProductContext → DTO 変換時の状態区分。
 * - "found"   : ProductRepository から商品情報が取得できた（LLM が使ってよい状態）
 * - "missing" : 指定された productId に該当するデータが見つからなかった
 * - "skipped" : 入力条件などの理由で、あえて商品情報の利用をスキップした
 */
export type PrecisionProductStatus = "found" | "missing" | "skipped";

/**
 * 商品データの取得元（ロガーと整合させるための大まかな区分）。
 * - "db"      : Neon / Prisma 経由の DB
 * - "api"     : 外部 API 経由など
 * - "cache"   : キャッシュレイヤー経由
 * - "unknown" : どれにも明示的に当てはまらない / まだ分類していない
 */
export type PrecisionProductDataSource = "db" | "api" | "cache" | "unknown";

/** ====== LLM に渡す商品仕様・属性のDTO ====== */

/**
 * LLM に渡す「仕様情報」の 1 行分。
 * 例:
 * - group: "サイズ・重量", key: "内容量", value: "200", unit: "mL"
 * - group: "材質", key: "本体", value: "ステンレス"
 */
export interface PrecisionProductSpecDto {
  /** 仕様のグルーピング名（例: "サイズ・重量", "材質", "電源" など）。不要なら undefined のままでもよい。 */
  group?: string;

  /** 仕様の項目名（例: "内容量", "本体", "電源方式" など）。 */
  key: string;

  /** 値本体（例: "200", "ステンレス", "単3形アルカリ乾電池2本" など）。 */
  value: string;

  /** 単位（例: "mL", "cm", "kg", "時間" など）。不要な場合は省略。 */
  unit?: string;
}

/**
 * LLM に渡す「属性・タグ情報」の 1 件分。
 * - 検索用タグというより、ライティング時に利用したい特徴・訴求ポイント・注意書き などを想定。
 */
export interface PrecisionProductAttributeDto {
  /** 属性名（例: "敏感肌対応", "メンズ向け", "送料無料", "在庫限り" など）。 */
  name: string;

  /**
   * 属性の種類。
   * - "feature"  : プロダクトの事実ベースの特長（例: "無香料", "日本製", "防水"）
   * - "benefit"  : ユーザーにとってのメリット（例: "時短になる", "乾燥を防ぐ"）
   * - "warning"  : 注意事項・制限（例: "医薬品ではない", "お子様の手の届かない場所に保管"）
   * - "target"   : ターゲットを示す属性（例: "30代女性向け", "初心者向け"）
   * - "other"    : 上記いずれにも当てはまらない、その他の属性
   */
  kind?: "feature" | "benefit" | "warning" | "target" | "other";

  /**
   * 属性に関する補足説明。
   * - 例: "アルコールフリーで、敏感肌の方でも使いやすい処方です。"
   * - LLM はここを文章生成のヒントとして利用する。
   */
  note?: string;
}

/** ====== PRODUCT_FACTS 用 DTO（将来の拡張スロット） ====== */

/**
 * PRODUCT_FACTS ブロックに載せる 1 行分の「事実情報」の種別。
 * - P3-6 時点では、Prompt 側の items 配列と 1:1 で対応する想定のみを定義し、
 *   具体的な利用ロジックは後続フェーズ（P3-7 以降）で実装する。
 */
export type ProductFactsItemKind = "spec" | "attribute" | "notice" | "custom";

/**
 * PRODUCT_FACTS ブロックに載せる 1 行分の「事実情報」DTO。
 *
 * 例:
 * - kind: "spec",     label: "内容量", value: "200", unit: "mL"
 * - kind: "attribute",label: "敏感肌対応", value: "やさしい使い心地", note: "アルコールフリー処方"
 * - kind: "notice",   label: "注意書き", value: "本品は医薬品ではありません"
 */
export interface ProductFactsItemDto {
  /**
   * FACT の種別。
   * - "spec"      : PrecisionProductSpecDto 由来の仕様情報
   * - "attribute" : PrecisionProductAttributeDto 由来の属性・訴求ポイント
   * - "notice"    : 注意書き・但し書き
   * - "custom"    : 上記以外の、手動定義されたカスタム情報
   */
  kind: ProductFactsItemKind;

  /**
   * 表示ラベル（例: "内容量", "こんな方におすすめ", "注意書き" など）。
   * - LLM にとっても、人間にとっても分かりやすいラベルを想定。
   */
  label: string;

  /**
   * 表示値（例: "200", "乾燥肌の方向け", "本品は医薬品ではありません" など）。
   * - 仕様由来の場合は単位なしの値本体を基本とし、必要に応じて unit と組み合わせて使う。
   */
  value: string;

  /**
   * 単位（例: "mL", "cm", "kg" など）。
   * - kind === "spec" のときによく使われるが、必須ではない。
   */
  unit?: string;

  /**
   * 追加の説明・補足。
   * - 例: 属性の背景説明や、注意書きの詳細など。
   */
  note?: string;

  /**
   * 元になった情報の識別子。
   * - 例: spec 由来なら spec の key、attribute 由来なら attribute の name など。
   * - P3-6 時点では必須にせず、将来のトレース用途のための拡張フィールドとして定義する。
   */
  sourceId?: string;
}

/**
 * PRODUCT_FACTS 全体を 1 つの DTO として扱いたい場合のラッパー。
 * - 必須ではないが、Prompt 側で「facts.items」という形で参照したいケースを想定して定義。
 * - P3-6 時点では、型の受け皿としてのみ利用される。
 */
export interface ProductFactsDto {
  items: ProductFactsItemDto[];
}

/** ====== 商品本体 DTO ====== */

/**
 * LLM に渡す「商品本体」の情報。
 * - ここには、ユーザーに見せてよい情報だけを載せる。
 * - 内部 ID や、生の JSON などは変換レイヤー側でフィルタした上で詰める前提。
 */
export interface PrecisionProductDto {
  /** LLM に公開してよい商品 ID（例: 公開用 slug や表示用 ID など）。 */
  id: PrecisionProductId;

  /** 商品名（例: "乾燥肌向け高保湿化粧水"）。 */
  name: string;

  /** カテゴリ（例: "化粧水", "スニーカー", "ノートPC" など）。 */
  category?: string;

  /** ブランド名（例: "ShopWriter コスメ", "Nike", "Apple" など）。 */
  brand?: string;

  /**
   * 短い説明文（例: 商品一覧に載るような一言キャッチ）。
   * - LLM が商品概要を把握するのに使う。
   */
  shortDescription?: string;

  /**
   * より詳しい説明文（例: 公式の商品説明テキストに近いもの）。
   * - LLM が文章生成時のコンテキストとして参照する。
   */
  longDescription?: string;

  /** 仕様情報の一覧。LLM にとって「事実ベースの根拠」となる。 */
  specs: PrecisionProductSpecDto[];

  /** 属性・タグ情報の一覧。LLM にとって「訴求ポイントや注意事項」のヒントとなる。 */
  attributes: PrecisionProductAttributeDto[];

  /**
   * 商品に関する注意書き・但し書きなど。
   * - 例: ["本商品は医薬品ではありません。効果には個人差があります。"]
   */
  notices?: string[];

  /**
   * 商品情報の主な言語・ロケール（例: "ja-JP"）。
   * - LLM の出力言語を決める際の参考として使用できる。
   */
  locale?: string;
}

/** ====== ProductContext → LLM ペイロードのルート DTO ====== */

/**
 * ProductContext から LLM に渡す際の「ルートペイロード」。
 * - /api/writer の Precision Prompt Engine に渡される JSON 構造の型。
 * - status/source/warnings によって、LLM がどこまで「事実」として扱ってよいかを判断できるようにする。
 */
export interface PrecisionProductPayload {
  /**
   * 商品情報の取得ステータス。
   * - "found"   : LLM が安心して利用してよい商品情報がある
   * - "missing" : 商品情報が見つからなかったため、LLM は固有仕様を勝手に作らない
   * - "skipped" : 意図的に商品情報を使わない（カテゴリ汎用コピーなど）
   */
  status: PrecisionProductStatus;

  /**
   * 商品情報の取得元。
   * - logging / monitoring 用にも利用することを想定。
   */
  source: PrecisionProductDataSource;

  /**
   * LLM に渡す商品本体情報。
   * - status !== "found" の場合は null の可能性がある。
   */
  product: PrecisionProductDto | null;

  /**
   * 変換時に付与した警告や注意文。
   * - 例: ["productId=xxx は DB に存在しなかったため、汎用説明にフォールバックしました。"]
   * - LLM に「どこまでを事実として扱うべきか」を伝えるヒントとしても使える。
   */
  warnings: string[];
}
