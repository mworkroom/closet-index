import { OutfitCard } from '../../components/OutfitCard'
import type {
  AppData,
  RecommendationInput,
  RecommendationResult,
} from '../../lib/types'

export function RecentPurchaseSection({
  data,
  input,
  weather,
  recommendations,
}: {
  data: AppData
  input: RecommendationInput
  weather?: unknown
  recommendations: readonly RecommendationResult[]
}) {
  if (recommendations.length === 0) return null

  return (
    <section className="section recent-purchase-section">
      <div className="section-heading">
        <div>
          <p className="eyebrow">RECENT PURCHASES</p>
          <h2>최근 구매 착장</h2>
        </div>
        <span className="count">{recommendations.length}개 후보</span>
      </div>

      <div className="recommendation-intro">
        <strong>
          오늘 온도에 맞고 직접 입어본 후보 중 최근 구매 아이템을 먼저
          골랐어요.
        </strong>
        <p>
          직접 착용한 OK 온도 범위와 맞는 Outfit만 구매일 최신순으로
          보여줍니다. 미착용 조합은 새 착장 시험해보기에 남습니다.
        </p>
      </div>

      <div className="card-list">
        {recommendations.map((recommendation) => (
          <OutfitCard
            key={recommendation.outfit.id}
            outfit={recommendation.outfit}
            data={data}
            recommendation={recommendation}
            purchaseHighlight
            layout="home"
            state={{ recommendation, input, weather }}
          />
        ))}
      </div>
    </section>
  )
}
