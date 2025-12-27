#!/usr/bin/env python3
"""
Deep Dive Topic Analysis - Analyzing main discussion themes distribution
Based on "Главные Темы Дискуссий" categories
"""

import csv
from collections import Counter, defaultdict
from datetime import datetime

# Load messages
print("Loading messages...")
messages = []
with open('../data/messages_export.csv', 'r', encoding='utf-8') as f:
    reader = csv.DictReader(f)
    for row in reader:
        row['timestamp'] = datetime.strptime(row['created_at'], '%Y-%m-%d %H:%M:%S')
        row['date'] = row['timestamp'].date()
        row['month'] = row['timestamp'].strftime('%Y-%m')
        messages.append(row)

print(f"Loaded {len(messages)} messages\n")

# Define main discussion topics (from year-in-review)
MAIN_TOPICS = {
    'Менеджмент и Процессы': [
        'микроменеджмент', 'делегирован', 'метрик', 'code tracking', 'heartbeat',
        'парное программирован', 'pair programming', 'геймификац', 'gamification',
        'техдолг', 'technical debt', 'tech debt', 'процесс', 'scrum', 'agile',
        'kanban', 'спринт', 'планирован', 'оценк', 'estimation', 'velocity',
        'ретроспектив', 'retrospective', 'daily', 'стендап', 'standup'
    ],
    'Люди и Команды': [
        'найм', 'hiring', 'джун', 'junior', 'мидл', 'middle', 'сеньор', 'senior',
        'собеседован', 'interview', 'зарплат', 'salary', 'компенсац', 'оффер', 'offer',
        'токсичн', 'toxic', 'конфликт', 'conflict', 'команд', 'team',
        'мотивац', 'motivation', 'выгоран', 'burnout', 'увольнен', 'firing',
        'онбординг', 'onboarding', 'развити', 'growth', 'карьер', 'career'
    ],
    'Технологии': [
        'ai', 'ml', 'chatgpt', 'gpt', 'llm', 'copilot', 'нейрон',
        'архитектур', 'architecture', 'микросервис', 'microservice', 'монолит', 'monolith',
        'нагрузк', 'load', 'performance', 'производительн',
        'безопасност', 'security', 'уязвимост', 'vulnerability',
        '.net', 'java', 'javascript', 'python', 'react', 'vue', 'angular',
        'docker', 'kubernetes', 'k8s', 'ci/cd', 'devops'
    ],
    'Бизнес': [
        'бизнес', 'business', 'стартап', 'startup', 'корпорац', 'corporation',
        'фриланс', 'freelance', 'аутстаф', 'outstuff', 'outsource',
        'переговор', 'negotiation', 'продукт', 'product', 'метрик бизнес',
        'roi', 'прибыл', 'profit', 'стоимост', 'cost', 'бюджет', 'budget'
    ]
}

# Additional sub-categories for detailed analysis
SUB_TOPICS = {
    # Менеджмент и Процессы
    'Микроменеджмент': ['микроменеджмент', 'micromanag', 'контрол'],
    'Делегирование': ['делегирован', 'delegat', 'ответственност', 'responsib'],
    'Метрики': ['метрик', 'metric', 'kpi', 'velocity', 'productivity'],
    'Парное программирование': ['парное программирован', 'pair programming', 'mob programming'],
    'Техдолг': ['техдолг', 'technical debt', 'tech debt', 'legacy', 'рефакторинг'],

    # Люди и Команды
    'Найм джунов': ['найм', 'hiring', 'джун', 'junior', 'стажер', 'intern'],
    'Зарплаты': ['зарплат', 'salary', 'компенсац', 'compensation', 'оффер', 'offer'],
    'Конфликты': ['конфликт', 'conflict', 'токсичн', 'toxic', 'спор'],
    'Выгорание': ['выгоран', 'burnout', 'устал', 'tired', 'stress'],

    # Технологии
    'AI/ML': ['ai', 'ml', 'chatgpt', 'gpt', 'llm', 'copilot', 'нейрон'],
    'Архитектура': ['архитектур', 'architecture', 'микросервис', 'монолит', 'паттерн'],
    'Производительность': ['производительн', 'performance', 'нагрузк', 'load', 'оптимизац'],
    'Безопасность': ['безопасност', 'security', 'уязвимост', 'vulnerability', 'атак'],

    # Бизнес
    'Стартапы': ['стартап', 'startup', 'mvp', 'product-market fit'],
    'Фриланс': ['фриланс', 'freelance', 'аутстаф', 'outstuff', 'удаленк'],
    'Переговоры': ['переговор', 'negotiation', 'зарплат', 'повышен', 'raise']
}

def match_topics(text, topics_dict):
    """Match text against topic keywords"""
    if not text:
        return []

    text_lower = text.lower()
    matched = []

    for topic, keywords in topics_dict.items():
        for keyword in keywords:
            if keyword in text_lower:
                matched.append(topic)
                break  # One match per topic is enough

    return matched

# Analyze messages
print("Analyzing main topics distribution...")
main_topic_counts = Counter()
sub_topic_counts = Counter()
monthly_topics = defaultdict(lambda: Counter())
topic_combinations = Counter()

for msg in messages:
    text = msg.get('user_message', '')
    month = msg['month']

    # Match main topics
    main_topics = match_topics(text, MAIN_TOPICS)
    for topic in main_topics:
        main_topic_counts[topic] += 1
        monthly_topics[month][topic] += 1

    # Match sub-topics
    sub_topics = match_topics(text, SUB_TOPICS)
    for topic in sub_topics:
        sub_topic_counts[topic] += 1

    # Track combinations (co-occurrence)
    if len(main_topics) > 1:
        combo = ' + '.join(sorted(main_topics))
        topic_combinations[combo] += 1

# Calculate percentages and overlaps
total_messages = len(messages)
total_categorized = sum(main_topic_counts.values())

print("\n" + "="*80)
print("РАСПРЕДЕЛЕНИЕ ГЛАВНЫХ ТЕМ ДИСКУССИЙ")
print("="*80)

print(f"\nВсего сообщений: {total_messages}")
print(f"Сообщений с идентифицированными темами: {total_categorized}")
print(f"Среднее количество тем на сообщение: {total_categorized / total_messages:.2f}\n")

for topic, count in main_topic_counts.most_common():
    pct = (count / total_messages) * 100
    share = (count / total_categorized) * 100
    print(f"{topic:30s}: {count:6d} упоминаний ({pct:5.1f}% от всех, {share:5.1f}% от темных)")

# Topic overlap analysis
print("\n" + "="*80)
print("ПЕРЕСЕЧЕНИЕ ТЕМ (Co-occurrence)")
print("="*80)
print("\nТоп-10 комбинаций тем:\n")

for combo, count in topic_combinations.most_common(10):
    pct = (count / total_messages) * 100
    print(f"{combo:60s}: {count:5d} ({pct:4.1f}%)")

# Sub-topics distribution
print("\n" + "="*80)
print("ДЕТАЛИЗАЦИЯ ПО ПОДТЕМАМ")
print("="*80)

# Group by main category
sub_by_main = {
    'Менеджмент и Процессы': ['Микроменеджмент', 'Делегирование', 'Метрики', 'Парное программирование', 'Техдолг'],
    'Люди и Команды': ['Найм джунов', 'Зарплаты', 'Конфликты', 'Выгорание'],
    'Технологии': ['AI/ML', 'Архитектура', 'Производительность', 'Безопасность'],
    'Бизнес': ['Стартапы', 'Фриланс', 'Переговоры']
}

for main_cat, subs in sub_by_main.items():
    print(f"\n### {main_cat}")
    category_total = main_topic_counts[main_cat]
    if category_total == 0:
        continue

    for sub in subs:
        count = sub_topic_counts[sub]
        pct_of_main = (count / category_total * 100) if category_total > 0 else 0
        pct_of_all = (count / total_messages * 100)
        print(f"  {sub:30s}: {count:5d} ({pct_of_main:5.1f}% от категории, {pct_of_all:4.1f}% от всех)")

# Monthly evolution
print("\n" + "="*80)
print("ЭВОЛЮЦИЯ ТЕМ ПО МЕСЯЦАМ")
print("="*80)

for month in sorted(monthly_topics.keys()):
    topics = monthly_topics[month]
    month_total = sum(topics.values())

    print(f"\n{month}:")
    for topic in ['Менеджмент и Процессы', 'Люди и Команды', 'Технологии', 'Бизнес']:
        count = topics[topic]
        pct = (count / month_total * 100) if month_total > 0 else 0
        print(f"  {topic:30s}: {count:4d} ({pct:5.1f}%)")

# Calculate implications
print("\n\n" + "="*80)
print("СПЕЦИФИЧЕСКИЕ ВЫВОДЫ ПО КАЖДОЙ ТЕМЕ")
print("="*80)

# Менеджмент
mgmt_count = main_topic_counts['Менеджмент и Процессы']
mgmt_pct = (mgmt_count / total_messages) * 100
print(f"\n### 1. МЕНЕДЖМЕНТ И ПРОЦЕССЫ ({mgmt_count} упоминаний, {mgmt_pct:.1f}%)")
print("\n**Вывод:**")

if mgmt_pct > 15:
    print(f"  → ВЫСОКАЯ фокусировка на процессах ({mgmt_pct:.1f}%)")
    print(f"  → Чат является профессиональным сообществом тимлидов")
    print(f"  → Основная боль: как правильно управлять и выстраивать процессы")
elif mgmt_pct > 10:
    print(f"  → СРЕДНЯЯ фокусировка на процессах ({mgmt_pct:.1f}%)")
    print(f"  → Процессы обсуждаются, но не доминируют")
else:
    print(f"  → НИЗКАЯ фокусировка на процессах ({mgmt_pct:.1f}%)")

# Check sub-topics
micro = sub_topic_counts['Микроменеджмент']
delegation = sub_topic_counts['Делегирование']
metrics = sub_topic_counts['Метрики']

if micro > 100:
    print(f"  → Микроменеджмент - горячая тема ({micro} упоминаний)")
    print(f"  → РЕКОМЕНДАЦИЯ: Нужны best practices по избежанию микроменеджмента")

if delegation > 100:
    print(f"  → Делегирование активно обсуждается ({delegation} упоминаний)")
    print(f"  → ВЫВОД: Тимлиды учатся отпускать контроль")

if metrics > 200:
    print(f"  → Метрики - очень важная тема ({metrics} упоминаний)")
    print(f"  → INSIGHT: Сообщество ищет объективные способы измерения прогресса")

# Люди и Команды
people_count = main_topic_counts['Люди и Команды']
people_pct = (people_count / total_messages) * 100
print(f"\n### 2. ЛЮДИ И КОМАНДЫ ({people_count} упоминаний, {people_pct:.1f}%)")
print("\n**Вывод:**")

if people_pct > 20:
    print(f"  → ОЧЕНЬ ВЫСОКАЯ фокусировка на людях ({people_pct:.1f}%)")
    print(f"  → People management - главная тема чата")
    print(f"  → Сообщество понимает: технологии вторичны, люди первичны")
elif people_pct > 15:
    print(f"  → ВЫСОКАЯ фокусировка на людях ({people_pct:.1f}%)")
    print(f"  → Управление людьми - ключевая компетенция")
else:
    print(f"  → УМЕРЕННАЯ фокусировка на людях ({people_pct:.1f}%)")

# Check people sub-topics
juniors = sub_topic_counts['Найм джунов']
salary = sub_topic_counts['Зарплаты']
conflicts = sub_topic_counts['Конфликты']
burnout = sub_topic_counts['Выгорание']

if juniors > 200:
    print(f"  → Найм и развитие джунов - горячая тема ({juniors} упоминаний)")
    print(f"  → INSIGHT: Рынок испытывает дефицит опытных разработчиков")
    print(f"  → ВЫВОД: Компании вынуждены растить джунов")

if salary > 300:
    print(f"  → Зарплаты активно обсуждаются ({salary} упоминаний)")
    print(f"  → ВЫВОД: Компенсация - важный фактор удержания")

if conflicts > 200:
    print(f"  → Конфликты в командах - частая проблема ({conflicts} упоминаний)")
    print(f"  → РЕКОМЕНДАЦИЯ: Нужны тренинги по разрешению конфликтов")

if burnout > 100:
    print(f"  → Выгорание обсуждается ({burnout} упоминаний)")
    print(f"  → ALERT: Проблема психического здоровья команд актуальна")

# Технологии
tech_count = main_topic_counts['Технологии']
tech_pct = (tech_count / total_messages) * 100
print(f"\n### 3. ТЕХНОЛОГИИ ({tech_count} упоминаний, {tech_pct:.1f}%)")
print("\n**Вывод:**")

if tech_pct > 25:
    print(f"  → ДОМИНИРУЮЩАЯ тема технологий ({tech_pct:.1f}%)")
    print(f"  → Чат сильно tech-ориентирован")
elif tech_pct > 15:
    print(f"  → ЗНАЧИТЕЛЬНЫЙ технический фокус ({tech_pct:.1f}%)")
    print(f"  → Тимлиды остаются вовлечены в технологии")
else:
    print(f"  → УМЕРЕННЫЙ технический фокус ({tech_pct:.1f}%)")
    print(f"  → Фокус больше на управлении, чем на технологиях")

# Check tech sub-topics
ai = sub_topic_counts['AI/ML']
arch = sub_topic_counts['Архитектура']
perf = sub_topic_counts['Производительность']
security = sub_topic_counts['Безопасность']

if ai > 500:
    print(f"  → AI/ML - ДОМИНИРУЮЩАЯ технологическая тема ({ai} упоминаний)")
    print(f"  → INSIGHT: AI-революция 2025 в самом разгаре")
    print(f"  → ПРОГНОЗ: Тренд продолжится в 2026")

if arch > 300:
    print(f"  → Архитектура активно обсуждается ({arch} упоминаний)")
    print(f"  → ВЫВОД: Тимлиды участвуют в архитектурных решениях")

if security < 100:
    print(f"  → Безопасность обсуждается редко ({security} упоминаний)")
    print(f"  → РИСК: Недостаточное внимание к security")
    print(f"  → РЕКОМЕНДАЦИЯ: Повысить security awareness")

# Бизнес
business_count = main_topic_counts['Бизнес']
business_pct = (business_count / total_messages) * 100
print(f"\n### 4. БИЗНЕС ({business_count} упоминаний, {business_pct:.1f}%)")
print("\n**Вывод:**")

if business_pct > 10:
    print(f"  → ВЫСОКАЯ бизнес-ориентированность ({business_pct:.1f}%)")
    print(f"  → Тимлиды думают о бизнесе, не только о коде")
    print(f"  → ВЫВОД: Зрелые лидеры с пониманием бизнеса")
elif business_pct > 5:
    print(f"  → СРЕДНЯЯ бизнес-ориентированность ({business_pct:.1f}%)")
    print(f"  → Бизнес-темы присутствуют, но не доминируют")
else:
    print(f"  → НИЗКАЯ бизнес-ориентированность ({business_pct:.1f}%)")
    print(f"  → OPPORTUNITY: Можно больше обсуждать бизнес-контекст")

# Save detailed CSV
print("\n\nСохранение детальных результатов...")

with open('../data/main_topics_distribution.csv', 'w', encoding='utf-8') as f:
    f.write('topic,count,percent_of_all,percent_of_categorized\n')
    for topic, count in main_topic_counts.most_common():
        pct_all = (count / total_messages) * 100
        pct_cat = (count / total_categorized) * 100
        f.write(f'"{topic}",{count},{pct_all:.2f},{pct_cat:.2f}\n')

with open('../data/sub_topics_distribution.csv', 'w', encoding='utf-8') as f:
    f.write('sub_topic,count,percent_of_all\n')
    for topic, count in sub_topic_counts.most_common():
        pct = (count / total_messages) * 100
        f.write(f'"{topic}",{count},{pct:.2f}\n')

with open('../data/topic_combinations.csv', 'w', encoding='utf-8') as f:
    f.write('combination,count,percent\n')
    for combo, count in topic_combinations.most_common():
        pct = (count / total_messages) * 100
        f.write(f'"{combo}",{count},{pct:.2f}\n')

print("\n✅ Детальный анализ завершен!")
print("\nФайлы созданы:")
print("  - main_topics_distribution.csv")
print("  - sub_topics_distribution.csv")
print("  - topic_combinations.csv")
