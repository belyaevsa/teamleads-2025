#!/usr/bin/env python3
"""
Extended Network Analysis - Multi-level connections from Big Four
Analyzes:
- Level 1: Big Four core network
- Level 2: Who talks most with Big Four members
- Level 3: Connections of Level 2 people
"""

import csv
from collections import defaultdict, Counter

# Define Big Four
BIG_FOUR = [
    "Andrii Kurdiumov",
    "Stanislav Belyaev",
    "Артур Пан",
    "Теймур Шайкемелов"
]

# Load network edges
print("Loading network data...")
edges = []
with open('../data/network_reply_edges.csv', 'r', encoding='utf-8') as f:
    reader = csv.DictReader(f)
    for row in reader:
        edges.append(row)

print(f"Loaded {len(edges)} edges\n")

# Build adjacency lists
connections_from = defaultdict(list)  # from_user -> [(to_user, weight), ...]
connections_to = defaultdict(list)    # to_user -> [(from_user, weight), ...]

for edge in edges:
    from_user = edge['from_user']
    to_user = edge['to_user']
    weight = int(edge['weight'])

    connections_from[from_user].append((to_user, weight))
    connections_to[to_user].append((from_user, weight))

# === LEVEL 1: Big Four Internal Network ===
print("="*80)
print("УРОВЕНЬ 1: ВНУТРЕННИЕ СВЯЗИ БОЛЬШОЙ ЧЕТВЕРКИ")
print("="*80)
print()

big_four_internal = []
for member in BIG_FOUR:
    if member in connections_from:
        for to_user, weight in connections_from[member]:
            if to_user in BIG_FOUR:
                big_four_internal.append((member, to_user, weight))

big_four_internal.sort(key=lambda x: x[2], reverse=True)

print("Внутренние связи:")
total_internal = 0
for from_user, to_user, weight in big_four_internal:
    print(f"  {from_user:30s} → {to_user:30s}: {weight:3d} взаимодействий")
    total_internal += weight

print(f"\nВсего внутренних взаимодействий: {total_internal}")
print()

# === LEVEL 2: Top connections for each Big Four member ===
print("="*80)
print("УРОВЕНЬ 2: ТОП-СВЯЗИ КАЖДОГО ЧЛЕНА БОЛЬШОЙ ЧЕТВЕРКИ")
print("="*80)
print()

level_2_people = set()

for member in BIG_FOUR:
    print(f"\n### {member}")
    print("-" * 60)

    # Get all connections (both outgoing and incoming)
    all_connections = defaultdict(int)

    # Outgoing
    if member in connections_from:
        for to_user, weight in connections_from[member]:
            if to_user not in BIG_FOUR:  # Exclude Big Four internal
                all_connections[to_user] += weight

    # Incoming
    if member in connections_to:
        for from_user, weight in connections_to[member]:
            if from_user not in BIG_FOUR:  # Exclude Big Four internal
                all_connections[from_user] += weight

    # Sort and display top 10
    top_connections = sorted(all_connections.items(), key=lambda x: x[1], reverse=True)[:10]

    for i, (person, total_weight) in enumerate(top_connections, 1):
        # Get directional weights
        out_weight = sum(w for u, w in connections_from.get(member, []) if u == person)
        in_weight = sum(w for u, w in connections_to.get(member, []) if u == person)

        balance = "сбалансировано" if abs(out_weight - in_weight) < 20 else \
                  f"→ активнее" if out_weight > in_weight else f"← активнее"

        print(f"  {i:2d}. {person:35s}: {total_weight:3d} (исх: {out_weight:3d}, вх: {in_weight:3d}) [{balance}]")

        # Add to level 2 set
        if i <= 5:  # Top 5 for each Big Four member
            level_2_people.add(person)

print(f"\n\nВсего уникальных людей в Level 2: {len(level_2_people)}")

# === LEVEL 3: Who Level 2 people talk to (excluding Big Four) ===
print("\n" + "="*80)
print("УРОВЕНЬ 3: С КЕМ ОБЩАЮТСЯ ЛЮДИ ИЗ УРОВНЯ 2")
print("="*80)
print()

level_3_connections = defaultdict(lambda: defaultdict(int))

for level_2_person in level_2_people:
    # Get their top connections (excluding Big Four)
    all_connections = defaultdict(int)

    # Outgoing
    if level_2_person in connections_from:
        for to_user, weight in connections_from[level_2_person]:
            if to_user not in BIG_FOUR:
                all_connections[to_user] += weight

    # Incoming
    if level_2_person in connections_to:
        for from_user, weight in connections_to[level_2_person]:
            if from_user not in BIG_FOUR:
                all_connections[from_user] += weight

    # Store top 5 for each level 2 person
    top_5 = sorted(all_connections.items(), key=lambda x: x[1], reverse=True)[:5]
    for person, weight in top_5:
        level_3_connections[level_2_person][person] = weight

# Display Level 3 connections
for level_2_person in sorted(level_2_people):
    if level_2_person in level_3_connections:
        print(f"\n### {level_2_person}")
        print("-" * 60)

        connections = sorted(level_3_connections[level_2_person].items(),
                           key=lambda x: x[1], reverse=True)

        for i, (person, weight) in enumerate(connections, 1):
            # Check if this person is also in level 2
            marker = " ⭐" if person in level_2_people else ""
            print(f"  {i}. {person:35s}: {weight:3d}{marker}")

# === SUMMARY: Network expansion visualization ===
print("\n" + "="*80)
print("ВИЗУАЛИЗАЦИЯ РАСШИРЕНИЯ СЕТИ")
print("="*80)
print()

print("УРОВЕНЬ 0 (Ядро): Большая Четверка")
print("  - Andrii Kurdiumov")
print("  - Stanislav Belyaev")
print("  - Артур Пан")
print("  - Теймур Шайкемелов")
print(f"  Всего: 4 человека")
print()

print("УРОВЕНЬ 1: Топ-5 связей каждого члена Большой Четверки")
for person in sorted(level_2_people):
    print(f"  - {person}")
print(f"  Всего: {len(level_2_people)} человек")
print()

# Find level 3 unique people
level_3_people = set()
for connections in level_3_connections.values():
    for person in connections.keys():
        if person not in level_2_people and person not in BIG_FOUR:
            level_3_people.add(person)

print("УРОВЕНЬ 2: Связи людей из Уровня 1 (исключая Большую Четверку)")
print(f"  Всего: {len(level_3_people)} новых человек")
print()

print("ИТОГО:")
print(f"  Уровень 0 (Ядро): 4 человека")
print(f"  Уровень 1: {len(level_2_people)} человек")
print(f"  Уровень 2: {len(level_3_people)} человек")
print(f"  Общее покрытие сети: {4 + len(level_2_people) + len(level_3_people)} человек")
print()

# === Export extended network data ===
print("\nСохранение расширенных данных...")

# Save level 2 connections
with open('../data/network_level2_connections.csv', 'w', encoding='utf-8', newline='') as f:
    writer = csv.writer(f)
    writer.writerow(['big_four_member', 'connected_person', 'total_weight', 'outgoing', 'incoming', 'balance'])

    for member in BIG_FOUR:
        # Get all connections
        all_connections = defaultdict(lambda: {'out': 0, 'in': 0})

        # Outgoing
        if member in connections_from:
            for to_user, weight in connections_from[member]:
                if to_user not in BIG_FOUR:
                    all_connections[to_user]['out'] = weight

        # Incoming
        if member in connections_to:
            for from_user, weight in connections_to[member]:
                if from_user not in BIG_FOUR:
                    all_connections[from_user]['in'] = weight

        # Sort and write top 10
        sorted_connections = sorted(
            all_connections.items(),
            key=lambda x: x[1]['out'] + x[1]['in'],
            reverse=True
        )[:10]

        for person, weights in sorted_connections:
            total = weights['out'] + weights['in']
            balance = 'balanced' if abs(weights['out'] - weights['in']) < 20 else \
                     'outgoing_heavy' if weights['out'] > weights['in'] else 'incoming_heavy'

            writer.writerow([member, person, total, weights['out'], weights['in'], balance])

print("✅ Сохранено: network_level2_connections.csv")

# Save level 3 network
with open('../data/network_level3_connections.csv', 'w', encoding='utf-8', newline='') as f:
    writer = csv.writer(f)
    writer.writerow(['level2_person', 'connected_person', 'weight', 'in_level2'])

    for level_2_person in sorted(level_2_people):
        if level_2_person in level_3_connections:
            for person, weight in sorted(level_3_connections[level_2_person].items(),
                                        key=lambda x: x[1], reverse=True):
                in_level2 = 'yes' if person in level_2_people else 'no'
                writer.writerow([level_2_person, person, weight, in_level2])

print("✅ Сохранено: network_level3_connections.csv")

print("\n✅ Расширенный сетевой анализ завершен!")
