#!/usr/bin/env python3
"""
Contextual Topic Analysis - Analyzes messages with surrounding context
Identifies daily topics by looking at conversation threads and message clusters
"""

import csv
import re
from collections import defaultdict, Counter
from datetime import datetime

# Load messages
print("Loading messages...")
messages = []
with open('../data/messages_export.csv', 'r', encoding='utf-8') as f:
    reader = csv.DictReader(f)
    for row in reader:
        # Parse timestamp
        row['timestamp'] = datetime.strptime(row['created_at'], '%Y-%m-%d %H:%M:%S')
        row['date'] = row['timestamp'].date()
        messages.append(row)

print(f"Loaded {len(messages)} messages\n")

# Sort by timestamp for sequential analysis
messages.sort(key=lambda x: x['timestamp'])

# Build conversation threads
print("Building conversation threads...")
threads = defaultdict(list)  # reply_to_messageid -> list of messages
message_by_id = {}  # messageid -> message

for msg in messages:
    msg_id = msg.get('messageid', '')
    reply_to = msg.get('reply_to_messageid', '')

    message_by_id[msg_id] = msg

    if reply_to:
        threads[reply_to].append(msg)

print(f"Found {len(threads)} conversation threads\n")

# Topic detection keywords (expanded and contextual)
TOPIC_PATTERNS = {
    'Управление командой': [
        'команд', 'тимлид', 'управлен', 'руководст', 'лидерст',
        'подчинен', 'сотрудник', 'мотивац', 'делегир', 'ответственност',
        'один на один', '1-1', 'one-on-one', 'фидбек', 'обратная связь'
    ],
    'Процессы разработки': [
        'процесс', 'методолог', 'scrum', 'agile', 'kanban', 'спринт',
        'ретроспектив', 'планирован', 'оценк', 'стендап', 'daily',
        'релиз', 'деплой', 'ci/cd', 'code review', 'ревью кода'
    ],
    'Найм и HR': [
        'найм', 'кандидат', 'собеседован', 'интервью', 'резюме',
        'зарплат', 'оффер', 'онбординг', 'увольнен', 'испытател',
        'джун', 'мидл', 'сеньор', 'грейд', 'карьер'
    ],
    'Архитектура': [
        'архитектур', 'проектирован', 'микросервис', 'монолит',
        'паттерн', 'design', 'масштаб', 'рефакторинг', 'техдолг',
        'legacy', 'миграц', 'интеграц'
    ],
    'Тестирование': [
        'тест', 'qa', 'баг', 'bug', 'автотест', 'unit', 'integration',
        'e2e', 'regression', 'coverage', 'покрыти', 'качество'
    ],
    'AI/ML': [
        'ai', 'ml', 'chatgpt', 'gpt', 'llm', 'нейрон', 'машинн обучен',
        'copilot', 'генератив', 'промпт', 'модель'
    ],
    'Конфликты и проблемы': [
        'конфликт', 'разногласи', 'спор', 'проблем', 'сложност',
        'не получается', 'застрял', 'не понимаю', 'выгоран', 'burnout'
    ],
    'Технический рост': [
        'обучен', 'курс', 'книг', 'статья', 'конференц', 'митап',
        'менторинг', 'развити', 'прокачк', 'навык', 'компетенц'
    ],
    'Метрики и KPI': [
        'метрик', 'kpi', 'okr', 'производительн', 'velocity',
        'эффективност', 'измерен', 'анализ', 'dashboard', 'дашборд'
    ],
    'Удаленка и офис': [
        'удаленк', 'remote', 'офис', 'гибрид', 'релокац',
        'timezone', 'часовой пояс', 'созвон', 'встреч'
    ]
}

def get_message_context(msg, messages, window=5):
    """Get surrounding messages for context (within same day)"""
    msg_idx = messages.index(msg)
    msg_date = msg['date']

    context_before = []
    context_after = []

    # Look back
    for i in range(max(0, msg_idx - window), msg_idx):
        if messages[i]['date'] == msg_date:
            context_before.append(messages[i])

    # Look ahead
    for i in range(msg_idx + 1, min(len(messages), msg_idx + window + 1)):
        if messages[i]['date'] == msg_date:
            context_after.append(messages[i])

    return context_before, context_after

def get_thread_context(msg, threads, message_by_id):
    """Get all messages in the conversation thread"""
    thread_messages = []

    # Get parent message if this is a reply
    reply_to = msg.get('reply_to_messageid', '')
    if reply_to and reply_to in message_by_id:
        thread_messages.append(message_by_id[reply_to])

    # Get replies to this message
    msg_id = msg.get('messageid', '')
    if msg_id in threads:
        thread_messages.extend(threads[msg_id])

    return thread_messages

def analyze_topic_with_context(msg, context_before, context_after, thread_context):
    """Analyze message topic considering all context"""
    # Combine all text for analysis
    msg_text = msg.get('user_message', '').lower()

    # Context text
    context_text = ' '.join([
        m.get('user_message', '').lower()
        for m in context_before + context_after + thread_context
        if m.get('user_message')
    ])

    # Combined text with more weight on the message itself
    combined = msg_text + ' ' + msg_text + ' ' + context_text

    # Score topics
    topic_scores = {}
    for topic, keywords in TOPIC_PATTERNS.items():
        score = 0
        for keyword in keywords:
            # Count in message (weight: 3)
            score += msg_text.count(keyword) * 3
            # Count in context (weight: 1)
            score += context_text.count(keyword)

        if score > 0:
            topic_scores[topic] = score

    return topic_scores

def identify_message_topics(msg, context_before, context_after, thread_context, min_score=2):
    """Identify topics for a message based on context"""
    topic_scores = analyze_topic_with_context(msg, context_before, context_after, thread_context)

    # Return topics that meet minimum score
    topics = [topic for topic, score in topic_scores.items() if score >= min_score]

    # If no specific topic, mark as General
    return topics if topics else ['Общие вопросы']

# Analyze all messages with context
print("Analyzing messages with contextual understanding...")
daily_topics = defaultdict(lambda: defaultdict(list))  # date -> topic -> messages
message_topics = {}  # messageid -> topics list

for i, msg in enumerate(messages):
    if i % 1000 == 0:
        print(f"Processed {i}/{len(messages)} messages...")

    # Get context
    context_before, context_after = get_message_context(msg, messages)
    thread_context = get_thread_context(msg, threads, message_by_id)

    # Identify topics
    topics = identify_message_topics(msg, context_before, context_after, thread_context)

    msg_id = msg.get('messageid', '')
    msg_date = msg['date']

    message_topics[msg_id] = topics

    for topic in topics:
        daily_topics[msg_date][topic].append(msg)

print(f"\nCompleted analysis of {len(messages)} messages\n")

# Generate daily topic report
print("=" * 80)
print("DAILY TOPIC SUMMARY - 2025")
print("=" * 80)

# Get all dates sorted
all_dates = sorted(daily_topics.keys())

for date in all_dates:
    topics = daily_topics[date]
    total_msgs = sum(len(msgs) for msgs in topics.values())

    print(f"\n📅 {date.strftime('%Y-%m-%d (%A)')}")
    print(f"   Всего сообщений: {total_msgs}")
    print(f"   Темы дня:")

    # Sort topics by number of messages
    sorted_topics = sorted(topics.items(), key=lambda x: len(x[1]), reverse=True)

    for topic, msgs in sorted_topics[:5]:  # Top 5 topics per day
        pct = (len(msgs) / total_msgs * 100)
        print(f"      • {topic}: {len(msgs)} сообщений ({pct:.1f}%)")

# Monthly topic aggregation
print("\n\n" + "=" * 80)
print("TOPIC TRENDS BY MONTH")
print("=" * 80)

monthly_topics = defaultdict(Counter)  # month -> topic -> count

for date, topics in daily_topics.items():
    month = date.strftime('%Y-%m')
    for topic, msgs in topics.items():
        monthly_topics[month][topic] += len(msgs)

for month in sorted(monthly_topics.keys()):
    topics = monthly_topics[month]
    total = sum(topics.values())

    print(f"\n{month}:")
    print(f"  Всего сообщений с темами: {total}")
    print(f"  Топ-5 тем:")

    for topic, count in topics.most_common(5):
        pct = (count / total * 100)
        print(f"    {topic:30s}: {count:5d} ({pct:5.1f}%)")

# Management and Process specific analysis
print("\n\n" + "=" * 80)
print("УПРАВЛЕНИЕ И ПРОЦЕССЫ - ДЕТАЛЬНЫЙ АНАЛИЗ")
print("=" * 80)

management_topics = ['Управление командой', 'Процессы разработки']

for topic in management_topics:
    print(f"\n{'=' * 80}")
    print(f"Тема: {topic}")
    print('=' * 80)

    # Days with discussions
    topic_days = []
    for date, topics in daily_topics.items():
        if topic in topics and len(topics[topic]) >= 3:  # At least 3 messages
            topic_days.append((date, topics[topic]))

    topic_days.sort(key=lambda x: len(x[1]), reverse=True)

    print(f"\nВсего дней с обсуждениями: {len(topic_days)}")
    print(f"\nТоп-10 самых активных дней:\n")

    for date, msgs in topic_days[:10]:
        print(f"  {date.strftime('%Y-%m-%d')}: {len(msgs)} сообщений")

        # Show snippet from most representative message
        msg_with_context = msgs[0]
        snippet = msg_with_context.get('user_message', '')[:150]
        if len(snippet) > 0:
            snippet = snippet.replace('\n', ' ').strip()
            print(f"    └─ «{snippet}...»")

# Overall topic distribution
print("\n\n" + "=" * 80)
print("ОБЩЕЕ РАСПРЕДЕЛЕНИЕ ТЕМ ЗА ГОД")
print("=" * 80)

overall_topics = Counter()
for topics_list in message_topics.values():
    for topic in topics_list:
        overall_topics[topic] += 1

total_topic_mentions = sum(overall_topics.values())

print(f"\nВсего упоминаний тем: {total_topic_mentions}")
print(f"(одно сообщение может относиться к нескольким темам)\n")

for topic, count in overall_topics.most_common():
    pct = (count / len(messages)) * 100
    print(f"{topic:30s}: {count:6d} упоминаний ({pct:5.1f}% от всех сообщений)")

# Save detailed results
print("\n\nСохранение результатов...")

# Daily topics CSV
with open('../data/daily_topics.csv', 'w', encoding='utf-8') as f:
    f.write('date,topic,message_count\n')
    for date in sorted(daily_topics.keys()):
        for topic, msgs in daily_topics[date].items():
            f.write(f"{date},{topic},{len(msgs)}\n")

# Message topics mapping
with open('../data/message_topics.csv', 'w', encoding='utf-8') as f:
    f.write('messageid,topics\n')
    for msg_id, topics in message_topics.items():
        topics_str = '|'.join(topics)
        f.write(f"{msg_id},{topics_str}\n")

# Management days detailed
with open('../data/management_days.csv', 'w', encoding='utf-8') as f:
    f.write('date,topic,message_count,sample_message\n')
    for topic in management_topics:
        for date, topics in daily_topics.items():
            if topic in topics:
                msgs = topics[topic]
                sample = msgs[0].get('user_message', '').replace('\n', ' ')[:200]
                f.write(f"{date},{topic},{len(msgs)},\"{sample}\"\n")

print("\n✅ Контекстный анализ завершен!")
print("\nФайлы созданы:")
print("  - daily_topics.csv (темы по дням)")
print("  - message_topics.csv (темы каждого сообщения)")
print("  - management_days.csv (дни с обсуждением управления/процессов)")
