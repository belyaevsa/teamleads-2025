#!/usr/bin/env python3
"""
Better Sentiment Analysis - More Accurate Question Detection
"""

import csv
import re
import logging
from collections import Counter, defaultdict

# Setup logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

# Load messages
logging.info("Loading messages from messages_export.csv...")
messages = []
try:
    with open('../data/messages_export.csv', 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        for row in reader:
            messages.append(row)
    logging.info(f"Loaded {len(messages)} messages successfully")
except FileNotFoundError:
    logging.error("messages_export.csv not found")
    raise
except Exception as e:
    logging.error(f"Error loading messages: {e}")
    raise

if not messages:
    logging.warning("No messages loaded, analysis will be empty")

# Better sentiment keywords
POSITIVE = ['спасибо', 'благодар', 'круто', 'отлично', 'супер', 'здорово', 'класс',
            'молодец', 'помогл', 'решил', 'получилось', 'работает', 'согласен',
            'правильно', 'верно', 'интересн', 'полезн', 'хорошо', 'отличн', 'збс']

NEGATIVE = ['проблем', 'ошибк', 'баг', 'не работает', 'сломал', 'упал', 'крэш',
            'не могу', 'не получается', 'застрял', 'помогите', 'херня', 'фигня',
            'плохо', 'ужасн', 'кошмар', 'боль', 'беда', 'провал', 'не понимаю']

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
        'можно ли', 'есть ли', 'а как', 'а что', 'а где'
    ]

    for q in question_starts:
        if text_lower.startswith(q):
            return True

    # Method 3: Help requests
    help_patterns = [
        'подскажите', 'подскажи', 'помогите', 'помоги',
        'объясните', 'объясни', 'расскажите', 'расскажи',
        'кто-нибудь', 'кто нибудь', 'может кто'
    ]

    for pattern in help_patterns:
        if pattern in text_lower:
            return True

    return False

def analyze_sentiment(text):
    """Analyze sentiment (excluding questions)"""
    if not text:
        logging.debug("Empty text, returning neutral")
        return 'neutral'

    # First check if it's a question
    if is_question(text):
        logging.debug(f"Detected question: {text[:50]}...")
        return 'question'

    text_lower = text.lower()

    pos_count = sum(1 for kw in POSITIVE if kw in text_lower)
    neg_count = sum(1 for kw in NEGATIVE if kw in text_lower)

    if pos_count > neg_count:
        logging.debug(f"Positive sentiment: pos={pos_count}, neg={neg_count}, text={text[:50]}...")
        return 'positive'
    elif neg_count > pos_count:
        logging.debug(f"Negative sentiment: pos={pos_count}, neg={neg_count}, text={text[:50]}...")
        return 'negative'
    logging.debug(f"Neutral sentiment: pos={pos_count}, neg={neg_count}, text={text[:50]}...")
    return 'neutral'

# Analyze
logging.info("Re-analyzing with better question detection...")
sentiment_by_month = defaultdict(Counter)
sentiment_dist = Counter()

for i, msg in enumerate(messages):
    if i % 1000 == 0:
        logging.info(f"Processed {i}/{len(messages)} messages...")
    text = msg.get('user_message', '')
    month = msg.get('month', '')

    sentiment = analyze_sentiment(text)
    sentiment_dist[sentiment] += 1
    sentiment_by_month[month][sentiment] += 1

logging.info(f"Analysis complete. Total sentiments: {dict(sentiment_dist)}")

# Results
print("\n" + "="*60)
print("CORRECTED SENTIMENT DISTRIBUTION")
print("="*60)
total = sum(sentiment_dist.values())
for sentiment, count in sentiment_dist.most_common():
    pct = (count / total) * 100
    print(f"{sentiment:12s}: {count:6d} ({pct:5.1f}%)")

print("\n" + "="*60)
print("CORRECTED SENTIMENT BY MONTH")
print("="*60)
for month in sorted(sentiment_by_month.keys()):
    counts = sentiment_by_month[month]
    month_total = sum(counts.values())
    print(f"\n{month}:")
    for sentiment in ['positive', 'negative', 'question', 'neutral']:
        count = counts[sentiment]
        pct = (count / month_total * 100) if month_total > 0 else 0
        print(f"  {sentiment:10s}: {count:4d} ({pct:5.1f}%)")

# Compare with old results
print("\n" + "="*60)
print("COMPARISON: OLD vs NEW")
print("="*60)
print("OLD: Questions: 49.9%")
print(f"NEW: Questions: {(sentiment_dist['question'] / total * 100):.1f}%")
print(f"\nDifference: {49.9 - (sentiment_dist['question'] / total * 100):.1f} percentage points")

# Save
try:
    with open('../data/sentiment_by_month_corrected.csv', 'w', encoding='utf-8') as f:
        f.write('month,positive,negative,question,neutral\n')
        for month in sorted(sentiment_by_month.keys()):
            counts = sentiment_by_month[month]
            f.write(f"{month},{counts['positive']},{counts['negative']},{counts['question']},{counts['neutral']}\n")
    logging.info("Successfully saved sentiment_by_month_corrected.csv")
except Exception as e:
    logging.error(f"Error saving CSV: {e}")
    raise

print("\n✅ Re-analysis complete! Saved to sentiment_by_month_corrected.csv")
