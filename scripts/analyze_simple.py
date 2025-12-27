#!/usr/bin/env python3
"""
Simple Sentiment and Topic Analysis (no external dependencies)
"""

import csv
import re
from collections import Counter, defaultdict
from datetime import datetime

# Load messages
print("Loading messages...")
messages = []
with open('../data/messages_export.csv', 'r', encoding='utf-8') as f:
    reader = csv.DictReader(f)
    for row in reader:
        messages.append(row)

print(f"Loaded {len(messages)} messages\n")

# Sentiment keywords (Russian)
POSITIVE = ['спасибо', 'благодар', 'круто', 'отлично', 'супер', 'здорово', 'класс',
            'молодец', 'помогл', 'решил', 'получилось', 'работает', 'согласен',
            'правильно', 'верно', 'интересн', 'полезн', 'хорошо', 'отличн']

NEGATIVE = ['проблем', 'ошибк', 'баг', 'не работает', 'сломал', 'упал', 'крэш',
            'не могу', 'не получается', 'застрял', 'помогите', 'херня', 'фигня',
            'плохо', 'ужасн', 'кошмар', 'боль', 'беда', 'провал']

QUESTIONS = ['как', 'что', 'где', 'почему', 'зачем', 'когда', '?']

# Topic keywords
TOPICS = {
    'AI/ML': ['ai', 'ml', 'chatgpt', 'gpt', 'llm', 'нейрон'],
    'Тестирование': ['тест', 'qa', 'bug', 'баг', 'junit'],
    'Архитектура': ['архитектур', 'микросервис', 'монолит'],
    'Менеджмент': ['менеджмент', 'тимлид', 'управлен'],
    'HR': ['найм', 'зарплат', 'собеседован', 'джун'],
}

def analyze_sentiment(text):
    """Analyze message sentiment"""
    if not text:
        return 'neutral'

    text_lower = text.lower()

    pos_count = sum(1 for kw in POSITIVE if kw in text_lower)
    neg_count = sum(1 for kw in NEGATIVE if kw in text_lower)
    is_question = any(kw in text_lower for kw in QUESTIONS)

    if is_question:
        return 'question'
    elif pos_count > neg_count:
        return 'positive'
    elif neg_count > pos_count:
        return 'negative'
    return 'neutral'

def extract_topics(text):
    """Extract topics from message"""
    if not text:
        return []

    text_lower = text.lower()
    found = []

    for topic, keywords in TOPICS.items():
        if any(kw in text_lower for kw in keywords):
            found.append(topic)

    return found if found else ['Other']

# Analyze all messages
print("Analyzing sentiment and topics...")
sentiment_by_month = defaultdict(Counter)
topic_counts = Counter()
sentiment_dist = Counter()
topic_sentiment = defaultdict(Counter)

for msg in messages:
    text = msg.get('user_message', '')
    month = msg.get('month', '')

    # Sentiment
    sentiment = analyze_sentiment(text)
    sentiment_dist[sentiment] += 1
    sentiment_by_month[month][sentiment] += 1

    # Topics
    topics = extract_topics(text)
    for topic in topics:
        topic_counts[topic] += 1
        topic_sentiment[topic][sentiment] += 1

# Print results
print("\n" + "="*60)
print("OVERALL SENTIMENT DISTRIBUTION")
print("="*60)
total = sum(sentiment_dist.values())
for sentiment, count in sentiment_dist.most_common():
    pct = (count / total) * 100
    print(f"{sentiment:12s}: {count:6d} ({pct:5.1f}%)")

print("\n" + "="*60)
print("SENTIMENT BY MONTH")
print("="*60)
for month in sorted(sentiment_by_month.keys()):
    counts = sentiment_by_month[month]
    month_total = sum(counts.values())
    print(f"\n{month}:")
    for sentiment in ['positive', 'negative', 'question', 'neutral']:
        count = counts[sentiment]
        pct = (count / month_total * 100) if month_total > 0 else 0
        print(f"  {sentiment:10s}: {count:4d} ({pct:5.1f}%)")

print("\n" + "="*60)
print("TOPIC DISTRIBUTION")
print("="*60)
for topic, count in topic_counts.most_common():
    pct = (count / len(messages)) * 100
    print(f"{topic:15s}: {count:5d} ({pct:5.1f}%)")

print("\n" + "="*60)
print("SENTIMENT BY TOPIC")
print("="*60)
for topic in sorted(topic_sentiment.keys()):
    counts = topic_sentiment[topic]
    topic_total = sum(counts.values())
    print(f"\n{topic} (total: {topic_total}):")
    for sentiment in ['positive', 'negative', 'question', 'neutral']:
        count = counts[sentiment]
        pct = (count / topic_total * 100) if topic_total > 0 else 0
        print(f"  {sentiment:10s}: {count:4d} ({pct:5.1f}%)")

# Most positive/negative months
print("\n" + "="*60)
print("MOST POSITIVE MONTHS (by % positive messages)")
print("="*60)
month_positivity = {}
for month, counts in sentiment_by_month.items():
    total = sum(counts.values())
    if total > 0:
        pct = (counts['positive'] / total) * 100
        month_positivity[month] = pct

for month, pct in sorted(month_positivity.items(), key=lambda x: x[1], reverse=True)[:5]:
    print(f"{month}: {pct:.1f}%")

print("\n" + "="*60)
print("MOST QUESTION-HEAVY MONTHS")
print("="*60)
month_questions = {}
for month, counts in sentiment_by_month.items():
    total = sum(counts.values())
    if total > 0:
        pct = (counts['question'] / total) * 100
        month_questions[month] = pct

for month, pct in sorted(month_questions.items(), key=lambda x: x[1], reverse=True)[:5]:
    print(f"{month}: {pct:.1f}%")

# Save results to CSV
print("\n\nSaving results to CSV files...")

# Sentiment by month CSV
with open('../data/sentiment_by_month.csv', 'w', encoding='utf-8') as f:
    f.write('month,positive,negative,question,neutral\n')
    for month in sorted(sentiment_by_month.keys()):
        counts = sentiment_by_month[month]
        f.write(f"{month},{counts['positive']},{counts['negative']},{counts['question']},{counts['neutral']}\n")

# Topic distribution CSV
with open('../data/topic_distribution.csv', 'w', encoding='utf-8') as f:
    f.write('topic,count\n')
    for topic, count in topic_counts.most_common():
        f.write(f"{topic},{count}\n")

print("\n✅ Analysis complete!")
print("Results saved to:")
print("  - sentiment_by_month.csv")
print("  - topic_distribution.csv")
