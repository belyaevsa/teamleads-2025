#!/usr/bin/env python3
"""
ML-based Sentiment Analysis using Conversational RuBERT

This script uses a pre-trained Russian BERT model fine-tuned for sentiment analysis
to provide more accurate sentiment classification compared to keyword-based approach.

Requirements:
    pip install transformers torch

Model: cointegrated/rubert-tiny-sentiment (optimized for Russian text)
- Lightweight (~100MB vs 1-2GB for full BERT)
- Fast inference
- Good accuracy for Russian sentiment

Categories:
- positive
- negative
- neutral
"""

import csv
import json
from collections import Counter, defaultdict
from datetime import datetime

print("="*80)
print("ML-BASED SENTIMENT ANALYSIS WITH RUBERT")
print("="*80)

# Check if required libraries are installed
try:
    import torch
    from transformers import AutoTokenizer, AutoModelForSequenceClassification
    import torch.nn.functional as F
    print("✅ All required libraries found (transformers, torch)")
except ImportError as e:
    print(f"\n❌ Missing required library: {e}")
    print("\nPlease install required dependencies:")
    print("  pip install transformers torch")
    print("\nAlternatively:")
    print("  pip install transformers torch --upgrade")
    exit(1)

print("\nLoading RuBERT model...")
print("Model: cointegrated/rubert-tiny-sentiment")
print("(First run will download ~100MB model)\n")

try:
    # Load model and tokenizer
    model_name = "cointegrated/rubert-tiny-sentiment"
    tokenizer = AutoTokenizer.from_pretrained(model_name)
    model = AutoModelForSequenceClassification.from_pretrained(model_name)

    print("✅ Model loaded successfully!")
    print(f"   Model size: ~100MB")
    print(f"   Labels: {model.config.id2label}\n")
except Exception as e:
    print(f"❌ Error loading model: {e}")
    print("\nTrying alternative model...")
    try:
        # Fallback to another sentiment model
        model_name = "blanchefort/rubert-base-cased-sentiment-rurewiews"
        tokenizer = AutoTokenizer.from_pretrained(model_name)
        model = AutoModelForSequenceClassification.from_pretrained(model_name)
        print("✅ Alternative model loaded successfully!")
    except Exception as e2:
        print(f"❌ Error loading alternative model: {e2}")
        print("\nPlease check your internet connection and try again.")
        exit(1)

def is_question(text):
    """Check if text is a question (same logic as keyword-based)"""
    if not text:
        return False

    if text.strip().endswith('?'):
        return True

    text_lower = text.lower().strip()
    question_starts = [
        'как ', 'что ', 'где ', 'почему ', 'зачем ', 'когда ', 'кто ',
        'какой ', 'какая ', 'какие ', 'сколько ', 'чем ', 'куда ',
        'можно ли', 'есть ли', 'а как', 'а что', 'а где', 'кому ', 'откуда '
    ]

    for q in question_starts:
        if text_lower.startswith(q):
            return True

    help_patterns = [
        'подскажите', 'подскажи', 'помогите', 'помоги',
        'объясните', 'объясни', 'расскажите', 'расскажи',
        'кто-нибудь', 'кто нибудь', 'может кто', 'посоветуйте'
    ]

    for pattern in help_patterns:
        if pattern in text_lower:
            return True

    return False

@torch.no_grad()
def predict_sentiment_ml(text, model, tokenizer):
    """
    Predict sentiment using RuBERT model

    Returns: ('positive' | 'negative' | 'neutral', confidence_score)
    """
    if not text or len(text.strip()) < 3:
        return 'neutral', 0.5

    # Tokenize
    inputs = tokenizer(text, return_tensors='pt', truncation=True, max_length=512, padding=True)

    # Get predictions
    outputs = model(**inputs)

    # Get probabilities
    probs = F.softmax(outputs.logits, dim=-1)
    predicted_class = torch.argmax(probs, dim=-1).item()
    confidence = probs[0][predicted_class].item()

    # Map to sentiment label
    sentiment = model.config.id2label[predicted_class]

    # Normalize labels (different models use different labels)
    if sentiment.lower() in ['positive', 'pos', 'позитивный', '1']:
        sentiment = 'positive'
    elif sentiment.lower() in ['negative', 'neg', 'негативный', '0']:
        sentiment = 'negative'
    else:
        sentiment = 'neutral'

    return sentiment, confidence

def analyze_sentiment_ml(text, model, tokenizer):
    """
    Analyze sentiment with ML model
    Questions are detected separately (not using ML)
    """
    # First check if it's a question (rule-based, reliable)
    if is_question(text):
        return 'question', 1.0

    # Use ML for sentiment
    sentiment, confidence = predict_sentiment_ml(text, model, tokenizer)
    return sentiment, confidence

# Load messages
print("Loading messages...")
messages = []
with open('../data/messages_export.csv', 'r', encoding='utf-8') as f:
    reader = csv.DictReader(f)
    for row in reader:
        messages.append(row)

print(f"Loaded {len(messages)} messages\n")

# Analyze with ML
print("Analyzing with RuBERT (this may take a few minutes)...")
print("Processing in batches for efficiency...\n")

sentiment_dist = Counter()
sentiment_by_month = defaultdict(Counter)
low_confidence = []  # Track low confidence predictions
confidence_scores = defaultdict(list)
examples = defaultdict(list)

batch_size = 100
total_batches = (len(messages) + batch_size - 1) // batch_size

start_time = datetime.now()

for batch_idx in range(total_batches):
    start_idx = batch_idx * batch_size
    end_idx = min(start_idx + batch_size, len(messages))
    batch = messages[start_idx:end_idx]

    for msg in batch:
        text = msg.get('user_message', '')
        month = msg.get('month', '')

        sentiment, confidence = analyze_sentiment_ml(text, model, tokenizer)

        sentiment_dist[sentiment] += 1
        sentiment_by_month[month][sentiment] += 1
        confidence_scores[sentiment].append(confidence)

        # Track low confidence predictions
        if sentiment != 'question' and confidence < 0.6:
            low_confidence.append({
                'text': text[:100],
                'predicted': sentiment,
                'confidence': confidence,
                'author': msg.get('user_name', 'Unknown')
            })

        # Store examples
        if len(examples[sentiment]) < 10:
            examples[sentiment].append({
                'text': text[:150],
                'author': msg.get('user_name', 'Unknown'),
                'confidence': confidence,
                'date': msg.get('created_at', '')[:10]
            })

    # Progress update
    if (batch_idx + 1) % 10 == 0 or batch_idx == total_batches - 1:
        progress = (end_idx / len(messages)) * 100
        elapsed = (datetime.now() - start_time).total_seconds()
        print(f"Progress: {end_idx}/{len(messages)} ({progress:.1f}%) - {elapsed:.1f}s elapsed")

elapsed_time = (datetime.now() - start_time).total_seconds()

print(f"\n✅ Analysis complete in {elapsed_time:.1f} seconds!")

# Print results
print("\n" + "="*80)
print("RUBERT ML-BASED SENTIMENT DISTRIBUTION")
print("="*80)

total = sum(sentiment_dist.values())
print(f"\nOVERALL DISTRIBUTION:")
print(f"{'Sentiment':<15} {'Count':<10} {'Percentage':<12} {'Avg Confidence':<15} {'Bar'}")
print("-" * 80)

for sentiment in ['neutral', 'question', 'positive', 'negative']:
    count = sentiment_dist[sentiment]
    pct = (count / total) * 100
    avg_conf = sum(confidence_scores[sentiment]) / len(confidence_scores[sentiment]) if confidence_scores[sentiment] else 0
    bar_length = int(pct / 2)
    bar = '█' * bar_length
    print(f"{sentiment:<15} {count:<10} {pct:>5.2f}%       {avg_conf:>5.1%}          {bar}")

print(f"\n{'Total':<15} {total:<10} 100.00%")

# Confidence analysis
print("\n" + "="*80)
print("CONFIDENCE ANALYSIS")
print("="*80)

for sentiment in ['positive', 'negative', 'neutral']:
    if confidence_scores[sentiment]:
        scores = confidence_scores[sentiment]
        avg = sum(scores) / len(scores)
        min_conf = min(scores)
        max_conf = max(scores)

        high_conf = sum(1 for s in scores if s > 0.8)
        med_conf = sum(1 for s in scores if 0.6 <= s <= 0.8)
        low_conf = sum(1 for s in scores if s < 0.6)

        print(f"\n{sentiment.upper()}:")
        print(f"  Average confidence: {avg:.1%}")
        print(f"  Range: {min_conf:.1%} - {max_conf:.1%}")
        print(f"  High confidence (>80%): {high_conf} ({high_conf/len(scores)*100:.1f}%)")
        print(f"  Medium confidence (60-80%): {med_conf} ({med_conf/len(scores)*100:.1f}%)")
        print(f"  Low confidence (<60%): {low_conf} ({low_conf/len(scores)*100:.1f}%)")

# Low confidence examples
print("\n" + "="*80)
print(f"LOW CONFIDENCE PREDICTIONS (< 60%) - {len(low_confidence)} total")
print("="*80)

for i, ex in enumerate(sorted(low_confidence, key=lambda x: x['confidence'])[:10], 1):
    print(f"\n{i}. [{ex['confidence']:.1%}] Predicted: {ex['predicted']}")
    print(f"   Author: {ex['author']}")
    print(f"   Text: {ex['text']}")

# Examples
print("\n" + "="*80)
print("EXAMPLES BY CATEGORY (Top 5 from each)")
print("="*80)

for sentiment in ['positive', 'negative', 'question', 'neutral']:
    print(f"\n{'='*80}")
    print(f"📌 {sentiment.upper()} ({sentiment_dist[sentiment]} total)")
    print(f"{'='*80}")

    for i, ex in enumerate(examples[sentiment][:5], 1):
        conf_str = f"[{ex['confidence']:.1%}]" if ex['confidence'] != 1.0 else "[rule]"
        print(f"\n{i}. {conf_str} [{ex['date']}] @{ex['author']}")
        print(f"   {ex['text']}")

# Save results
print("\n" + "="*80)
print("SAVING RESULTS")
print("="*80)

# Save by month
with open('../data/sentiment_by_month_rubert.csv', 'w', encoding='utf-8') as f:
    f.write('month,positive,negative,question,neutral\n')
    for month in sorted(sentiment_by_month.keys()):
        counts = sentiment_by_month[month]
        f.write(f"{month},{counts['positive']},{counts['negative']},{counts['question']},{counts['neutral']}\n")

print("✅ Saved: sentiment_by_month_rubert.csv")

# Save detailed results with confidence
with open('../data/sentiment_rubert_detailed.csv', 'w', encoding='utf-8', newline='') as f:
    writer = csv.writer(f)
    writer.writerow(['author', 'date', 'message', 'sentiment', 'confidence'])

    for msg in messages:
        text = msg.get('user_message', '')
        sentiment, confidence = analyze_sentiment_ml(text, model, tokenizer)
        writer.writerow([
            msg.get('user_name', ''),
            msg.get('created_at', '')[:10],
            text,
            sentiment,
            f"{confidence:.3f}"
        ])

print("✅ Saved: sentiment_rubert_detailed.csv")

# Save low confidence for manual review
with open('../data/sentiment_rubert_low_confidence.csv', 'w', encoding='utf-8', newline='') as f:
    writer = csv.writer(f)
    writer.writerow(['author', 'message', 'predicted_sentiment', 'confidence', 'manual_sentiment', 'notes'])

    for ex in low_confidence:
        writer.writerow([
            ex['author'],
            ex['text'],
            ex['predicted'],
            f"{ex['confidence']:.3f}",
            '',  # Empty for manual review
            ''
        ])

print("✅ Saved: sentiment_rubert_low_confidence.csv")

# Summary
print("\n" + "="*80)
print("SUMMARY")
print("="*80)
print(f"""
Model: {model_name}
Messages analyzed: {len(messages)}
Processing time: {elapsed_time:.1f} seconds ({elapsed_time/len(messages)*1000:.1f} ms/message)

Distribution:
- Neutral: {sentiment_dist['neutral']} ({sentiment_dist['neutral']/total*100:.1f}%)
- Questions: {sentiment_dist['question']} ({sentiment_dist['question']/total*100:.1f}%)
- Positive: {sentiment_dist['positive']} ({sentiment_dist['positive']/total*100:.1f}%)
- Negative: {sentiment_dist['negative']} ({sentiment_dist['negative']/total*100:.1f}%)

Average confidence:
- Positive: {sum(confidence_scores['positive'])/len(confidence_scores['positive'])*100:.1f}%
- Negative: {sum(confidence_scores['negative'])/len(confidence_scores['negative'])*100:.1f}%
- Neutral: {sum(confidence_scores['neutral'])/len(confidence_scores['neutral'])*100:.1f}%

Low confidence predictions: {len(low_confidence)} ({len(low_confidence)/total*100:.1f}%)

Files created:
1. sentiment_by_month_rubert.csv - Monthly breakdown
2. sentiment_rubert_detailed.csv - All messages with confidence scores
3. sentiment_rubert_low_confidence.csv - Low confidence predictions for review

Next steps:
1. Compare with keyword-based results (analyze_better.py)
2. Manually review low confidence predictions
3. Calculate accuracy by spot-checking a sample
""")

print("="*80)
print("✨ RuBERT Analysis Complete!")
print("="*80)
