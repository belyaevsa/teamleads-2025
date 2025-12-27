#!/usr/bin/env python3
"""
Social Network Analysis - Who talks to whom in the chat
Analyzes:
- Direct replies (who responds to whom)
- Temporal proximity (who talks close in time)
- Conversation clusters
- Key connectors and influencers
"""

import csv
from collections import defaultdict, Counter
from datetime import datetime, timedelta

# Load messages
print("Loading messages...")
messages = []
with open('../data/messages_export.csv', 'r', encoding='utf-8') as f:
    reader = csv.DictReader(f)
    for row in reader:
        row['timestamp'] = datetime.strptime(row['created_at'], '%Y-%m-%d %H:%M:%S')
        messages.append(row)

print(f"Loaded {len(messages)} messages\n")

# Sort by timestamp
messages.sort(key=lambda x: x['timestamp'])

# Build user index
users = {}
for msg in messages:
    user_name = msg.get('user_name', 'Unknown')
    user_tgid = msg.get('messageid', '').split('_')[0] if '_' in msg.get('messageid', '') else ''
    if user_name and user_name != 'Unknown':
        users[user_name] = user_tgid

print(f"Found {len(users)} unique users\n")

# === ANALYSIS 1: Direct Reply Network ===
print("="*80)
print("АНАЛИЗ 1: СЕТЬ ПРЯМЫХ ОТВЕТОВ")
print("="*80)

reply_network = defaultdict(Counter)  # user -> {replied_to_user: count}
reply_received = defaultdict(Counter)  # user -> {received_from_user: count}

message_by_id = {}
for msg in messages:
    msg_id = msg.get('messageid', '')
    message_by_id[msg_id] = msg

for msg in messages:
    user_name = msg.get('user_name', '')
    reply_to_id = msg.get('reply_to_messageid', '')

    if reply_to_id and reply_to_id in message_by_id:
        original_msg = message_by_id[reply_to_id]
        replied_to_user = original_msg.get('user_name', '')

        if user_name and replied_to_user and user_name != replied_to_user:
            reply_network[user_name][replied_to_user] += 1
            reply_received[replied_to_user][user_name] += 1

# Top reply pairs
print("\nТоп-20 пар (кто кому отвечает чаще всего):\n")
all_pairs = []
for user, replied_to in reply_network.items():
    for replied_user, count in replied_to.items():
        all_pairs.append((user, replied_user, count))

all_pairs.sort(key=lambda x: x[2], reverse=True)

for i, (user, replied_to, count) in enumerate(all_pairs[:20], 1):
    # Check mutual connection
    reverse_count = reply_network.get(replied_to, {}).get(user, 0)
    mutual = f"↔️ взаимно: {reverse_count}" if reverse_count > 0 else "→ односторонне"
    print(f"{i:2d}. {user:30s} → {replied_to:30s}: {count:3d} ответов ({mutual})")

# === ANALYSIS 2: Most Connected Users ===
print("\n" + "="*80)
print("АНАЛИЗ 2: САМЫЕ СВЯЗАННЫЕ УЧАСТНИКИ")
print("="*80)

# Outgoing connections (who they reply to)
print("\n### Кто отвечает чаще всего (исходящие связи):\n")
user_outgoing = {}
for user, replied_to in reply_network.items():
    user_outgoing[user] = sum(replied_to.values())

for i, (user, count) in enumerate(sorted(user_outgoing.items(), key=lambda x: x[1], reverse=True)[:15], 1):
    unique_users = len(reply_network[user])
    avg = count / unique_users if unique_users > 0 else 0
    print(f"{i:2d}. {user:35s}: {count:4d} ответов {unique_users:3d} людям (ср. {avg:.1f}/человек)")

# Incoming connections (who replies to them)
print("\n### Кто получает ответов чаще всего (входящие связи):\n")
user_incoming = {}
for user, received_from in reply_received.items():
    user_incoming[user] = sum(received_from.values())

for i, (user, count) in enumerate(sorted(user_incoming.items(), key=lambda x: x[1], reverse=True)[:15], 1):
    unique_users = len(reply_received[user])
    avg = count / unique_users if unique_users > 0 else 0
    print(f"{i:2d}. {user:35s}: {count:4d} ответов от {unique_users:3d} людей (ср. {avg:.1f}/человек)")

# === ANALYSIS 3: Key Connectors (betweenness) ===
print("\n" + "="*80)
print("АНАЛИЗ 3: КЛЮЧЕВЫЕ КОННЕКТОРЫ")
print("="*80)

# Users who connect different groups
connector_score = {}
for user in reply_network:
    # How many different people they talk to
    outgoing = len(reply_network.get(user, {}))
    # How many different people talk to them
    incoming = len(reply_received.get(user, {}))
    # Total unique connections
    total_connections = outgoing + incoming
    # Total interaction volume
    total_volume = user_outgoing.get(user, 0) + user_incoming.get(user, 0)

    connector_score[user] = {
        'unique_connections': total_connections,
        'total_volume': total_volume,
        'score': total_connections * total_volume  # Combined metric
    }

print("\nУчастники, соединяющие сообщество (по количеству уникальных связей):\n")
sorted_connectors = sorted(connector_score.items(), key=lambda x: x[1]['unique_connections'], reverse=True)

for i, (user, stats) in enumerate(sorted_connectors[:15], 1):
    print(f"{i:2d}. {user:35s}: {stats['unique_connections']:3d} уникальных связей, "
          f"{stats['total_volume']:4d} взаимодействий")

# === ANALYSIS 4: Temporal Proximity (who talks close in time) ===
print("\n" + "="*80)
print("АНАЛИЗ 4: ВРЕМЕННАЯ БЛИЗОСТЬ")
print("="*80)
print("(кто часто пишет сообщения близко по времени)\n")

# Consider messages within 5 minutes as "in conversation"
TIME_WINDOW = timedelta(minutes=5)

temporal_proximity = defaultdict(Counter)

for i in range(len(messages) - 1):
    current_msg = messages[i]
    next_msg = messages[i + 1]

    current_user = current_msg.get('user_name', '')
    next_user = next_msg.get('user_name', '')

    if current_user and next_user and current_user != next_user:
        time_diff = next_msg['timestamp'] - current_msg['timestamp']

        if time_diff <= TIME_WINDOW:
            temporal_proximity[current_user][next_user] += 1
            temporal_proximity[next_user][current_user] += 1

# Top temporal pairs
print("Топ-20 пар участников, часто пишущих друг после друга (в течение 5 минут):\n")
temporal_pairs = []
processed_pairs = set()

for user, others in temporal_proximity.items():
    for other_user, count in others.items():
        pair = tuple(sorted([user, other_user]))
        if pair not in processed_pairs:
            processed_pairs.add(pair)
            temporal_pairs.append((user, other_user, count))

temporal_pairs.sort(key=lambda x: x[2], reverse=True)

for i, (user1, user2, count) in enumerate(temporal_pairs[:20], 1):
    # Check if they also have direct replies
    reply_connection = reply_network.get(user1, {}).get(user2, 0) + reply_network.get(user2, {}).get(user1, 0)
    connection_type = f"(ответы: {reply_connection})" if reply_connection > 0 else "(нет прямых ответов)"
    print(f"{i:2d}. {user1:30s} ↔ {user2:30s}: {count:4d} раз в одно время {connection_type}")

# === ANALYSIS 5: Conversation Clusters ===
print("\n" + "="*80)
print("АНАЛИЗ 5: РАЗГОВОРНЫЕ КЛАСТЕРЫ")
print("="*80)

# Find groups of users who frequently talk together
# Based on both replies and temporal proximity

user_affinity = defaultdict(Counter)

# Add reply connections
for user, replied_to in reply_network.items():
    for other_user, count in replied_to.items():
        user_affinity[user][other_user] += count

# Add temporal proximity
for user, others in temporal_proximity.items():
    for other_user, count in others.items():
        user_affinity[user][other_user] += count * 0.5  # Weight temporal less than replies

# For each user, find their closest connections
print("\nБлижайшие связи топ-15 активных участников:\n")

# Get top 15 most active users
top_active = sorted(user_outgoing.items(), key=lambda x: x[1], reverse=True)[:15]

for user, _ in top_active:
    connections = user_affinity[user]
    if connections:
        top_3 = connections.most_common(3)
        connections_str = ", ".join([f"{u} ({c:.0f})" for u, c in top_3])
        print(f"{user:35s} → {connections_str}")

# === ANALYSIS 6: Mutual Strong Connections ===
print("\n" + "="*80)
print("АНАЛИЗ 6: СИЛЬНЫЕ ВЗАИМНЫЕ СВЯЗИ")
print("="*80)
print("(пары с активным двусторонним общением)\n")

mutual_connections = []

for user1, replied_to in reply_network.items():
    for user2, count1 in replied_to.items():
        count2 = reply_network.get(user2, {}).get(user1, 0)
        if count2 > 0:  # Mutual
            # Only add each pair once
            if user1 < user2:  # Alphabetical ordering to avoid duplicates
                total = count1 + count2
                balance = abs(count1 - count2)
                mutual_connections.append({
                    'user1': user1,
                    'user2': user2,
                    'count1': count1,
                    'count2': count2,
                    'total': total,
                    'balance': balance
                })

mutual_connections.sort(key=lambda x: x['total'], reverse=True)

print("Топ-20 взаимных пар (кто активно общается друг с другом):\n")
for i, conn in enumerate(mutual_connections[:20], 1):
    balance_pct = (conn['balance'] / conn['total'] * 100) if conn['total'] > 0 else 0
    balance_str = "сбалансировано" if balance_pct < 30 else "несбалансировано"

    print(f"{i:2d}. {conn['user1']:30s} ↔ {conn['user2']:30s}")
    print(f"     {conn['user1']}: {conn['count1']:3d} → {conn['user2']}: {conn['count2']:3d} "
          f"(всего: {conn['total']}, {balance_str})")

# === ANALYSIS 7: Influencers and Amplifiers ===
print("\n" + "="*80)
print("АНАЛИЗ 7: ВЛИЯТЕЛЬНЫЕ УЧАСТНИКИ И УСИЛИТЕЛИ")
print("="*80)

# Influencers: People who get many replies (others react to them)
# Amplifiers: People who reply a lot (they engage with others)

print("\n### Влиятельные (получают много ответов, генерируют дискуссии):\n")
for i, (user, count) in enumerate(sorted(user_incoming.items(), key=lambda x: x[1], reverse=True)[:10], 1):
    unique = len(reply_received[user])
    engagement_rate = count / unique if unique > 0 else 0
    print(f"{i:2d}. {user:35s}: {count:4d} ответов от {unique:3d} человек "
          f"(ср. engagement: {engagement_rate:.1f})")

print("\n### Усилители (активно отвечают другим, поддерживают дискуссии):\n")
for i, (user, count) in enumerate(sorted(user_outgoing.items(), key=lambda x: x[1], reverse=True)[:10], 1):
    unique = len(reply_network[user])
    spread_rate = count / unique if unique > 0 else 0
    print(f"{i:2d}. {user:35s}: {count:4d} ответов {unique:3d} людям "
          f"(ср. интенсивность: {spread_rate:.1f})")

# === ANALYSIS 8: Time-based Patterns ===
print("\n" + "="*80)
print("АНАЛИЗ 8: ВРЕМЕННЫЕ ПАТТЕРНЫ ВЗАИМОДЕЙСТВИЙ")
print("="*80)

# Analyze when people interact most
hourly_interactions = defaultdict(lambda: defaultdict(Counter))

for msg in messages:
    reply_to_id = msg.get('reply_to_messageid', '')
    if reply_to_id and reply_to_id in message_by_id:
        user_name = msg.get('user_name', '')
        replied_to_user = message_by_id[reply_to_id].get('user_name', '')

        if user_name and replied_to_user and user_name != replied_to_user:
            hour = msg['timestamp'].hour
            hourly_interactions[hour][user_name][replied_to_user] += 1

print("\nНаиболее активные часы для взаимодействий:\n")
hourly_totals = {hour: sum(sum(users.values()) for users in hourly_interactions[hour].values())
                 for hour in range(24)}

sorted_hours = sorted(hourly_totals.items(), key=lambda x: x[1], reverse=True)

for hour, count in sorted_hours[:10]:
    print(f"{hour:2d}:00 - {hour+1:2d}:00: {count:4d} взаимодействий")

# === Save Network Data ===
print("\n\nСохранение данных сети...")

# Reply network edges
with open('../data/network_reply_edges.csv', 'w', encoding='utf-8') as f:
    f.write('from_user,to_user,weight,mutual\n')
    for user, replied_to in reply_network.items():
        for other_user, count in replied_to.items():
            reverse = reply_network.get(other_user, {}).get(user, 0)
            mutual = 'yes' if reverse > 0 else 'no'
            f.write(f'"{user}","{other_user}",{count},{mutual}\n')

# Temporal proximity edges
with open('../data/network_temporal_edges.csv', 'w', encoding='utf-8') as f:
    f.write('user1,user2,proximity_count\n')
    for (user1, user2, count) in temporal_pairs:
        f.write(f'"{user1}","{user2}",{count}\n')

# User stats
with open('../data/network_user_stats.csv', 'w', encoding='utf-8') as f:
    f.write('user,replies_sent,replies_received,unique_replied_to,unique_replied_by,connector_score\n')
    all_users = set(user_outgoing.keys()) | set(user_incoming.keys())
    for user in all_users:
        out = user_outgoing.get(user, 0)
        inc = user_incoming.get(user, 0)
        out_unique = len(reply_network.get(user, {}))
        inc_unique = len(reply_received.get(user, {}))
        score = connector_score.get(user, {}).get('score', 0)
        f.write(f'"{user}",{out},{inc},{out_unique},{inc_unique},{score}\n')

# Mutual strong connections
with open('../data/network_mutual_connections.csv', 'w', encoding='utf-8') as f:
    f.write('user1,user2,user1_to_user2,user2_to_user1,total,balance\n')
    for conn in mutual_connections:
        f.write(f'"{conn["user1"]}","{conn["user2"]}",{conn["count1"]},{conn["count2"]},'
                f'{conn["total"]},{conn["balance"]}\n')

print("\n✅ Анализ социальной сети завершен!")
print("\nФайлы созданы:")
print("  - network_reply_edges.csv (прямые ответы)")
print("  - network_temporal_edges.csv (временная близость)")
print("  - network_user_stats.csv (статистика участников)")
print("  - network_mutual_connections.csv (взаимные связи)")
