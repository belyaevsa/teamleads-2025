# Sentiment & Topic Analysis Results

## Executive Summary

Analyzed **23,426 messages** from January to December 2025.

### Key Findings:

1. **The community is highly inquisitive**: 49.9% of all messages are questions
2. **Overwhelmingly neutral/constructive tone**: Only 4% negative sentiment
3. **Collaborative learning environment**: High question ratio indicates active knowledge sharing
4. **Testing discussions generate most negativity**: 8.4% negative (bug reports, problems)
5. **AI/ML topics are mostly questions**: 59.5% questions (people learning about AI)

---

## Overall Sentiment Distribution

| Sentiment | Count | Percentage |
|-----------|-------|------------|
| **Questions** | 11,693 | 49.9% |
| **Neutral** | 9,915 | 42.3% |
| **Negative** | 945 | 4.0% |
| **Positive** | 873 | 3.7% |

### Interpretation:

- **Community Character**: This is a **learning and problem-solving community**
- Almost **50% questions** = active help-seeking and knowledge sharing
- **Low negativity** (4%) = constructive, professional atmosphere
- **Low positivity** (3.7%) = technical/professional focus rather than social

---

## Sentiment Trends Over Time

### Most Positive Months:
1. **February 2025** — 4.9% positive
2. **April 2025** — 4.6% positive
3. **June 2025** — 4.4% positive

### Most Question-Heavy Months (Highest Learning Activity):
1. **January 2025** — 63.5% questions (community forming, many questions)
2. **March 2025** — 53.1% questions
3. **April 2025** — 52.8% questions

### Observation:
- **Early months** (Jan-Apr) had MORE questions (52-63%) — community was learning together
- **Later months** (Jul-Dec) had FEWER questions (47-48%) — more established knowledge base
- Questions dropped from 63.5% → 48% as community matured

---

## Sentiment by Topic

### AI/ML (985 messages)
- Questions: **59.5%** ← People actively learning about AI
- Neutral: 35.0%
- Positive: 3.0%
- Negative: 2.4%

**Insight**: AI is a hot topic with lots of questions and exploration

### Тестирование (1,026 messages)
- Questions: 63.6%
- Neutral: 26.1%
- **Negative: 8.4%** ← Highest negativity (bug reports, issues)
- Positive: 1.9%

**Insight**: Testing discussions often involve problems/bugs, hence higher negativity

### Архитектура (246 messages)
- **Questions: 68.3%** ← Highest question ratio
- Neutral: 22.8%
- Negative: 6.1%
- Positive: 2.8%

**Insight**: Architecture is complex, generates most questions

### Менеджмент (487 messages)
- Questions: 66.1%
- Neutral: 26.5%
- Negative: 5.3%
- Positive: 2.1%

**Insight**: Management topics generate questions and debates

### HR (417 messages)
- Questions: 60.7%
- Neutral: 32.4%
- Negative: 4.1%
- Positive: 2.9%

**Insight**: HR topics (hiring, salaries) are question-driven

---

## Monthly Sentiment Evolution

### January 2025 (Birth Month)
- Questions: **63.5%** (highest of the year!)
- Negative: 4.8%
- Neutral: 29.0%
- Positive: 2.7%

**Narrative**: Community starting out, lots of foundational questions

### May 2025 (Growth Explosion)
- Questions: 51.5%
- Negative: 4.1%
- Neutral: 40.6%
- Positive: 3.8%

**Narrative**: Peak growth month, balanced sentiment

### December 2025 (Year End)
- Questions: 48.2%
- Negative: 3.3%
- Neutral: 44.8%
- Positive: 3.6%

**Narrative**: Mature community, more neutral discussions, fewer questions

---

## Topic Distribution

| Topic | Messages | % of Total |
|-------|----------|------------|
| Other (General) | 20,538 | 87.7% |
| Тестирование | 1,026 | 4.4% |
| AI/ML | 985 | 4.2% |
| Менеджмент | 487 | 2.1% |
| HR | 417 | 1.8% |
| Архитектура | 246 | 1.1% |

**Note**: Most messages are general discussions (87.7%). Specific technical topics make up ~12% of content.

---

## Community Health Indicators

### ✅ Healthy Signs:

1. **Low toxicity** (4% negative) — professional, respectful environment
2. **High engagement** (50% questions) — active learning culture
3. **Stable sentiment** across months — consistent community culture
4. **Question ratio decreasing** (63%→48%) — knowledge accumulation working

### ⚠️ Areas to Monitor:

1. **Low positive sentiment** (3.7%) — could benefit from more celebration/recognition
2. **Testing = most negative** — support needed for debugging/problem-solving
3. **Architecture generates most questions** — opportunity for more educational content

---

## Recommendations for Community Growth

1. **Celebrate Wins More**
   - Current: 3.7% positive messages
   - Opportunity: Encourage sharing successes, solved problems, launches

2. **Support Debugging Sessions**
   - Testing has highest negativity (8.4%)
   - Create dedicated help threads or pair debugging sessions

3. **Architecture Learning Resources**
   - 68.3% questions on architecture
   - Consider regular architecture workshops or design review sessions

4. **Maintain Question Culture**
   - Questions are a strength, not weakness
   - Continue encouraging open questioning

---

## Sentiment Timeline

```
Month    Positive  Negative  Questions  Neutral
Jan      ▂▂        ▃▃        ████████   ▃▃▃
Feb      ▃▃▃       ▃▃        ████████   ▄▄▄▄
Mar      ▂▂▂       ▃▃▃       ████████   ▄▄▄▄
Apr      ▃▃▃       ▂▂▂       ████████   ▄▄▄▄
May      ▂▂▂       ▃▃        ████████   ▄▄▄▄
Jun      ▃▃▃       ▂▂▂       ████████   ▄▄▄▄
Jul      ▂▂▂       ▃▃        ███████    ▄▄▄▄▄
Aug      ▂▂▂       ▃▃▃       ███████    ▄▄▄▄
Sep      ▂▂        ▂▂▂       ███████    ▄▄▄▄▄
Oct      ▂▂▂       ▃▃▃       ████████   ▄▄▄▄
Nov      ▂▂        ▃▃▃       ███████    ▄▄▄▄▄
Dec      ▂▂▂       ▂▂        ███████    ▄▄▄▄▄
```

**Trend**: Questions gradually decreasing, neutral discussions increasing = maturing community

---

## Files Generated:

1. `messages_export.csv` - Full message export (23,426 messages)
2. `sentiment_by_month.csv` - Monthly sentiment breakdown
3. `topic_distribution.csv` - Topic frequency data
4. `analyze_simple.py` - Analysis script (reusable)

---

## Conclusion

The "Тимлид не кодит" community is a **healthy, learning-focused, professional environment** with:
- Strong question culture (49.9%)
- Low toxicity (4% negative)
- Consistent, respectful tone
- Active knowledge sharing

The community is maturing well, with questions decreasing as collective knowledge grows, while maintaining a supportive atmosphere.
