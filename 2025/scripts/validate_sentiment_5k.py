#!/usr/bin/env python3
"""
Comprehensive Sentiment Analysis Validation on 5000 Random Messages

This script:
1. Randomly samples 5000 messages from the dataset
2. Runs sentiment analysis on each
3. Provides detailed statistics and examples
4. Shows confidence intervals and distribution
5. Exports results for manual validation if needed
"""

import csv
import random
from collections import Counter, defaultdict

# Set seed for reproducibility
random.seed(42)

# Sentiment keywords (from analyze_better.py)
POSITIVE = ['спасибо', 'благодар', 'круто', 'отлично', 'супер', 'здорово', 'класс',
            'молодец', 'помогл', 'решил', 'получилось', 'работает', 'согласен',
            'правильно', 'верно', 'интересн', 'полезн', 'хорошо', 'отличн', 'збс',
            'отличная', 'хороший', 'классный', 'понятно', 'ясно']

NEGATIVE = ['проблем', 'ошибк', 'баг', 'не работает', 'сломал', 'упал', 'крэш',
            'не могу', 'не получается', 'застрял', 'помогите', 'херня', 'фигня',
            'плохо', 'ужасн', 'кошмар', 'боль', 'беда', 'провал', 'не понимаю',
            'не понял', 'непонятно', 'сложн', 'трудн', 'мучаюсь', 'страдаю']

def is_question(text):
    """Better question detection - only real questions"""
    if not text:
        return False

    # Method 1: Ends with '?'
    if text.strip().endswith('?'):
        return True

    # Method 2: Starts with question word (at beginning of sentence)
    text_lower = text.lower().strip()
    question_starts = [
        'как ', 'что ', 'где ', 'почему ', 'зачем ', 'когда ', 'кто ',
        'какой ', 'какая ', 'какие ', 'сколько ', 'чем ', 'куда ',
        'можно ли', 'есть ли', 'а как', 'а что', 'а где', 'кому ', 'откуда '
    ]

    for q in question_starts:
        if text_lower.startswith(q):
            return True

    # Method 3: Help requests
    help_patterns = [
        'подскажите', 'подскажи', 'помогите', 'помоги',
        'объясните', 'объясни', 'расскажите', 'расскажи',
        'кто-нибудь', 'кто нибудь', 'может кто', 'посоветуйте'
    ]

    for pattern in help_patterns:
        if pattern in text_lower:
            return True

    return False

def analyze_sentiment(text):
    """Analyze sentiment (excluding questions)"""
    if not text:
        return 'neutral'

    # First check if it's a question
    if is_question(text):
        return 'question'

    text_lower = text.lower()

    pos_count = sum(1 for kw in POSITIVE if kw in text_lower)
    neg_count = sum(1 for kw in NEGATIVE if kw in text_lower)

    if pos_count > neg_count:
        return 'positive'
    elif neg_count > pos_count:
        return 'negative'
    return 'neutral'

def get_keyword_matches(text, sentiment):
    """Return which keywords matched for this sentiment"""
    text_lower = text.lower()
    matches = []

    if sentiment == 'positive':
        matches = [kw for kw in POSITIVE if kw in text_lower]
    elif sentiment == 'negative':
        matches = [kw for kw in NEGATIVE if kw in text_lower]
    elif sentiment == 'question':
        # Check what made it a question
        if text.strip().endswith('?'):
            matches.append('[ends with ?]')
        text_lower = text.lower().strip()
        question_starts = ['как ', 'что ', 'где ', 'почему ', 'зачем ', 'когда ', 'кто ',
                          'какой ', 'какая ', 'какие ', 'сколько ', 'чем ', 'куда ',
                          'можно ли', 'есть ли', 'а как', 'а что', 'а где']
        for q in question_starts:
            if text_lower.startswith(q):
                matches.append(f'[starts with "{q.strip()}"]')
        help_patterns = ['подскажите', 'подскажи', 'помогите', 'помоги',
                        'объясните', 'объясни', 'расскажите', 'расскажи',
                        'кто-нибудь', 'кто нибудь', 'может кто']
        for pattern in help_patterns:
            if pattern in text_lower:
                matches.append(f'[contains "{pattern}"]')

    return matches

# Load messages
print("Loading messages...")
messages = []
with open('../data/messages_export.csv', 'r', encoding='utf-8') as f:
    reader = csv.DictReader(f)
    for row in reader:
        messages.append(row)

print(f"Loaded {len(messages)} total messages")

# Sample 5000 messages
SAMPLE_SIZE = min(5000, len(messages))
print(f"Sampling {SAMPLE_SIZE} random messages (seed=42 for reproducibility)...")
sampled_messages = random.sample(messages, SAMPLE_SIZE)

# Analyze sampled messages
print(f"Analyzing {SAMPLE_SIZE} messages...\n")
sentiment_dist = Counter()
examples = defaultdict(list)  # Store examples for each sentiment
keyword_freq = defaultdict(Counter)  # Track keyword frequency

for msg in sampled_messages:
    text = msg.get('user_message', '')
    sentiment = analyze_sentiment(text)
    sentiment_dist[sentiment] += 1

    # Store examples (keep first 20 for each category)
    if len(examples[sentiment]) < 20:
        examples[sentiment].append({
            'text': text[:150],  # First 150 chars
            'author': msg.get('user_name', 'Unknown'),
            'date': msg.get('created_at', '')[:10],
            'matches': get_keyword_matches(text, sentiment)
        })

    # Track keyword frequency
    matches = get_keyword_matches(text, sentiment)
    for match in matches:
        keyword_freq[sentiment][match] += 1

# Print results
print("="*80)
print(f"SENTIMENT ANALYSIS VALIDATION - {SAMPLE_SIZE} MESSAGES")
print("="*80)

total = sum(sentiment_dist.values())
print(f"\nOVERALL DISTRIBUTION:")
print(f"{'Sentiment':<15} {'Count':<10} {'Percentage':<12} {'Bar'}")
print("-" * 80)

for sentiment in ['neutral', 'question', 'positive', 'negative']:
    count = sentiment_dist[sentiment]
    pct = (count / total) * 100
    bar_length = int(pct / 2)  # Scale to 50 chars max
    bar = '█' * bar_length
    print(f"{sentiment:<15} {count:<10} {pct:>5.2f}%       {bar}")

print(f"\n{'Total':<15} {total:<10} 100.00%")

# Statistical confidence
print("\n" + "="*80)
print("STATISTICAL CONFIDENCE")
print("="*80)
import math
for sentiment in ['neutral', 'question', 'positive', 'negative']:
    count = sentiment_dist[sentiment]
    p = count / total
    # 95% confidence interval (binomial proportion)
    se = math.sqrt(p * (1 - p) / total)
    margin = 1.96 * se  # 95% CI
    ci_lower = (p - margin) * 100
    ci_upper = (p + margin) * 100
    print(f"{sentiment:<15}: {p*100:5.2f}% ± {margin*100:.2f}% (95% CI: [{ci_lower:.2f}%, {ci_upper:.2f}%])")

# Show examples for each category
print("\n" + "="*80)
print("EXAMPLES BY CATEGORY (First 10 from each)")
print("="*80)

for sentiment in ['positive', 'negative', 'question', 'neutral']:
    print(f"\n{'='*80}")
    print(f"📌 {sentiment.upper()} ({sentiment_dist[sentiment]} total)")
    print(f"{'='*80}")

    for i, ex in enumerate(examples[sentiment][:10], 1):
        print(f"\n{i}. [{ex['date']}] @{ex['author']}")
        print(f"   Text: {ex['text']}")
        if ex['matches']:
            print(f"   Matched: {', '.join(ex['matches'][:5])}")  # Show first 5 matches

# Top keywords per sentiment
print("\n" + "="*80)
print("TOP KEYWORD MATCHES PER SENTIMENT")
print("="*80)

for sentiment in ['positive', 'negative', 'question']:
    print(f"\n{sentiment.upper()} - Top 15 keywords:")
    for keyword, count in keyword_freq[sentiment].most_common(15):
        pct = (count / sentiment_dist[sentiment]) * 100 if sentiment_dist[sentiment] > 0 else 0
        print(f"  {keyword:<30} {count:>4} times ({pct:>5.1f}%)")

# Message length analysis by sentiment
print("\n" + "="*80)
print("MESSAGE LENGTH BY SENTIMENT")
print("="*80)

length_by_sentiment = defaultdict(list)
for msg in sampled_messages:
    text = msg.get('user_message', '')
    sentiment = analyze_sentiment(text)
    length_by_sentiment[sentiment].append(len(text))

for sentiment in ['positive', 'negative', 'question', 'neutral']:
    lengths = length_by_sentiment[sentiment]
    if lengths:
        avg_len = sum(lengths) / len(lengths)
        min_len = min(lengths)
        max_len = max(lengths)
        median_len = sorted(lengths)[len(lengths)//2]
        print(f"{sentiment:<15}: avg={avg_len:>6.1f} chars, median={median_len:>4}, min={min_len:>4}, max={max_len:>4}")

# Export validation sample to CSV for manual checking
print("\n" + "="*80)
print("EXPORTING VALIDATION DATA")
print("="*80)

with open('../data/validation_sample_5k.csv', 'w', encoding='utf-8', newline='') as f:
    writer = csv.writer(f)
    writer.writerow(['author', 'date', 'message', 'auto_sentiment', 'manual_sentiment', 'notes'])

    for msg in sampled_messages:
        text = msg.get('user_message', '')
        sentiment = analyze_sentiment(text)
        writer.writerow([
            msg.get('user_name', ''),
            msg.get('created_at', '')[:10],
            text,
            sentiment,
            '',  # Empty for manual validation
            ''   # Empty for notes
        ])

print("✅ Exported validation_sample_5k.csv for manual validation")

# Export detailed statistics
with open('../data/validation_statistics_5k.csv', 'w', encoding='utf-8', newline='') as f:
    writer = csv.writer(f)
    writer.writerow(['sentiment', 'count', 'percentage', 'ci_lower', 'ci_upper'])

    for sentiment in ['positive', 'negative', 'question', 'neutral']:
        count = sentiment_dist[sentiment]
        p = count / total
        se = math.sqrt(p * (1 - p) / total)
        margin = 1.96 * se
        writer.writerow([
            sentiment,
            count,
            f"{p*100:.2f}",
            f"{(p - margin)*100:.2f}",
            f"{(p + margin)*100:.2f}"
        ])

print("✅ Exported validation_statistics_5k.csv with confidence intervals")

print("\n" + "="*80)
print("VALIDATION COMPLETE")
print("="*80)
print(f"""
Summary:
- Analyzed: {SAMPLE_SIZE} randomly sampled messages
- Sample represents: {(SAMPLE_SIZE/len(messages)*100):.1f}% of total dataset
- Neutral: {sentiment_dist['neutral']} ({sentiment_dist['neutral']/total*100:.1f}%)
- Questions: {sentiment_dist['question']} ({sentiment_dist['question']/total*100:.1f}%)
- Positive: {sentiment_dist['positive']} ({sentiment_dist['positive']/total*100:.1f}%)
- Negative: {sentiment_dist['negative']} ({sentiment_dist['negative']/total*100:.1f}%)

Files created:
1. validation_sample_5k.csv - Full dataset for manual validation
2. validation_statistics_5k.csv - Statistical summary with confidence intervals

Next steps for accuracy validation:
1. Manually validate a subset (e.g., 200-300 messages) from validation_sample_5k.csv
2. Calculate accuracy = correctly_classified / manually_validated
3. Update methodology with actual accuracy figure
""")
