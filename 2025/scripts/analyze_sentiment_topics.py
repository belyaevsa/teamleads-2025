#!/usr/bin/env python3
"""
Sentiment and Topic Analysis for Teamleads Chat
Analyzes messages to identify:
- Sentiment patterns over time
- Topic clusters
- Emotional trends by month
"""

import pandas as pd
import re
from collections import Counter, defaultdict
from datetime import datetime

# Load the data
print("Loading messages...")
df = pd.read_csv('../data/messages_export.csv')
print(f"Loaded {len(df)} messages")

# Clean and prepare data
df['created_at'] = pd.to_datetime(df['created_at'])
df['user_message'] = df['user_message'].fillna('')

# ============================================
# SENTIMENT ANALYSIS (Russian keywords)
# ============================================

# Define sentiment keywords for Russian
positive_keywords = [
    'спасибо', 'благодар', 'круто', 'отлично', 'супер', 'здорово', 'класс',
    'молодец', 'помогл', 'решил', 'получилось', 'работает', 'согласен',
    'правильно', 'верно', 'интересн', 'полезн', 'хорошо', 'отличн',
    'успех', 'победа', 'достиг', 'завершил'
]

negative_keywords = [
    'проблем', 'ошибк', 'баг', 'не работает', 'сломал', 'упал', 'крэш',
    'не могу', 'не получается', 'застрял', 'помогите', 'херня', 'фигня',
    'плохо', 'ужасн', 'кошмар', 'боль', 'беда', 'провал', 'фейл',
    'не понимаю', 'сложн', 'трудн', 'непонятн'
]

question_keywords = [
    'как', 'что', 'где', 'почему', 'зачем', 'когда', 'кто',
    '?', 'подскаж', 'помог', 'объясни', 'расскаж'
]

def analyze_sentiment(text):
    """Analyze sentiment of a message"""
    if pd.isna(text) or not text:
        return 'neutral'

    text_lower = text.lower()

    # Count matches
    positive_count = sum(1 for kw in positive_keywords if kw in text_lower)
    negative_count = sum(1 for kw in negative_keywords if kw in text_lower)
    is_question = any(kw in text_lower for kw in question_keywords)

    # Determine sentiment
    if is_question:
        return 'question'
    elif positive_count > negative_count:
        return 'positive'
    elif negative_count > positive_count:
        return 'negative'
    else:
        return 'neutral'

print("\nAnalyzing sentiment...")
df['sentiment'] = df['user_message'].apply(analyze_sentiment)

# Sentiment by month
sentiment_by_month = df.groupby(['month', 'sentiment']).size().unstack(fill_value=0)
print("\n=== SENTIMENT BY MONTH ===")
print(sentiment_by_month)

# Overall sentiment distribution
sentiment_dist = df['sentiment'].value_counts()
print("\n=== OVERALL SENTIMENT DISTRIBUTION ===")
print(sentiment_dist)
print(f"\nPercentages:")
for sentiment, count in sentiment_dist.items():
    pct = (count / len(df)) * 100
    print(f"{sentiment}: {pct:.1f}%")

# ============================================
# TOPIC EXTRACTION
# ============================================

# Define topic keywords
topic_keywords = {
    'AI/ML': ['ai', 'ml', 'chatgpt', 'gpt', 'llm', 'нейрон', 'машинн', 'обучен'],
    'Тестирование': ['тест', 'qa', 'bug', 'баг', 'junit', 'unit', 'интеграцион'],
    'Архитектура': ['архитектур', 'микросервис', 'монолит', 'паттерн', 'design'],
    'Менеджмент': ['менеджмент', 'тимлид', 'управлен', 'команд', 'процесс'],
    'HR': ['найм', 'зарплат', 'собеседован', 'джун', 'сеньор', 'карьер'],
    'Frontend': ['react', 'vue', 'angular', 'javascript', 'typescript', 'фронтенд', 'css'],
    'Backend': ['backend', 'бэкенд', 'api', 'rest', 'graphql', 'сервер'],
    'DevOps': ['docker', 'kubernetes', 'k8s', 'ci/cd', 'devops', 'deploy'],
    'Database': ['база данн', 'sql', 'postgres', 'mongodb', 'redis', 'бд'],
    'Performance': ['производительн', 'оптимизац', 'нагрузк', 'performance', 'скорост'],
}

def extract_topics(text):
    """Extract topics from message"""
    if pd.isna(text) or not text:
        return []

    text_lower = text.lower()
    topics = []

    for topic, keywords in topic_keywords.items():
        if any(kw in text_lower for kw in keywords):
            topics.append(topic)

    return topics if topics else ['Other']

print("\nExtracting topics...")
df['topics'] = df['user_message'].apply(extract_topics)

# Flatten topics for counting
all_topics = []
for topics_list in df['topics']:
    all_topics.extend(topics_list)

topic_counts = Counter(all_topics)
print("\n=== TOPIC DISTRIBUTION ===")
for topic, count in topic_counts.most_common():
    pct = (count / len(df)) * 100
    print(f"{topic}: {count} messages ({pct:.1f}%)")

# Topics by month
topic_by_month = defaultdict(Counter)
for _, row in df.iterrows():
    month = row['month']
    for topic in row['topics']:
        topic_by_month[month][topic] += 1

print("\n=== TOP 3 TOPICS BY MONTH ===")
for month in sorted(topic_by_month.keys()):
    print(f"\n{month}:")
    for topic, count in topic_by_month[month].most_common(3):
        print(f"  {topic}: {count}")

# ============================================
# SENTIMENT BY TOPIC
# ============================================

print("\n=== SENTIMENT BY TOPIC ===")
topic_sentiment = defaultdict(Counter)
for _, row in df.iterrows():
    sentiment = row['sentiment']
    for topic in row['topics']:
        topic_sentiment[topic][sentiment] += 1

for topic in sorted(topic_sentiment.keys()):
    sentiments = topic_sentiment[topic]
    total = sum(sentiments.values())
    print(f"\n{topic} (total: {total}):")
    for sentiment in ['positive', 'negative', 'question', 'neutral']:
        count = sentiments[sentiment]
        pct = (count / total * 100) if total > 0 else 0
        print(f"  {sentiment}: {count} ({pct:.1f}%)")

# ============================================
# FIND PEAKS AND VALLEYS
# ============================================

# Most positive days
df['date'] = df['created_at'].dt.date
daily_sentiment = df.groupby('date')['sentiment'].apply(
    lambda x: (x == 'positive').sum() / len(x) * 100
)
print("\n=== MOST POSITIVE DAYS ===")
for date, score in daily_sentiment.nlargest(5).items():
    print(f"{date}: {score:.1f}% positive")

print("\n=== MOST NEGATIVE DAYS ===")
for date, score in daily_sentiment.nsmallest(5).items():
    print(f"{date}: {score:.1f}% positive (more negative)")

# ============================================
# KEY PHRASES BY SENTIMENT
# ============================================

def extract_key_phrases(messages, sentiment_type, n=10):
    """Extract most common phrases from messages with specific sentiment"""
    phrases = []
    for msg in messages[messages['sentiment'] == sentiment_type]['user_message']:
        if pd.isna(msg):
            continue
        # Extract 2-3 word phrases
        words = re.findall(r'\b\w+\b', msg.lower())
        for i in range(len(words) - 1):
            if len(words[i]) > 3 and len(words[i+1]) > 3:
                phrases.append(f"{words[i]} {words[i+1]}")

    return Counter(phrases).most_common(n)

print("\n=== MOST COMMON POSITIVE PHRASES ===")
for phrase, count in extract_key_phrases(df, 'positive', 10):
    print(f"{phrase}: {count}")

print("\n=== MOST COMMON NEGATIVE PHRASES ===")
for phrase, count in extract_key_phrases(df, 'negative', 10):
    print(f"{phrase}: {count}")

# Save results
print("\n\nSaving results...")
results = {
    'sentiment_by_month': sentiment_by_month,
    'topic_counts': topic_counts,
    'sentiment_distribution': sentiment_dist
}

# Save to CSV for easy reading
sentiment_by_month.to_csv('sentiment_by_month.csv')
pd.DataFrame(topic_counts.most_common(), columns=['Topic', 'Count']).to_csv('topic_distribution.csv', index=False)

print("\n✅ Analysis complete!")
print("Results saved to:")
print("  - sentiment_by_month.csv")
print("  - topic_distribution.csv")
