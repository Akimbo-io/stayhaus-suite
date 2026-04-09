"""
StayHaus - Create Client Portal in Notion
Replicates the Mushpresso-style portal structure 1:1.
"""
import json
import os
import sys
import urllib.request
import urllib.error

NOTION_TOKEN = os.environ.get("NOTION_TOKEN", "")
PARENT_PAGE_ID = os.environ.get("PARENT_PAGE_ID", "")

HEADERS = {
    "Authorization": f"Bearer {NOTION_TOKEN}",
    "Notion-Version": "2022-06-28",
    "Content-Type": "application/json"
}


def notion_request(method, url, data=None):
    body = json.dumps(data).encode() if data else None
    req = urllib.request.Request(url, data=body, headers=HEADERS, method=method)
    try:
        with urllib.request.urlopen(req) as resp:
            return json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        error_body = e.read().decode()
        print(f"ERROR {e.code}: {error_body[:300]}")
        raise


def create_page(parent_id, title, icon=None):
    data = {
        "parent": {"type": "page_id", "page_id": parent_id},
        "properties": {"title": [{"text": {"content": title}}]}
    }
    if icon:
        data["icon"] = icon
    return notion_request("POST", "https://api.notion.com/v1/pages", data)


def create_database(parent_id, title, properties):
    data = {
        "parent": {"type": "page_id", "page_id": parent_id},
        "title": [{"text": {"content": title}}],
        "properties": properties
    }
    return notion_request("POST", "https://api.notion.com/v1/databases", data)


def append_blocks(block_id, children):
    data = {"children": children}
    return notion_request("PATCH",
        f"https://api.notion.com/v1/blocks/{block_id}/children", data)


def rt(content):
    """Rich text helper"""
    return [{"type": "text", "text": {"content": content}}]


def create_portal(client_data):
    brand_name = client_data.get("brand_name", "Нов Клиент")
    print(f"Creating portal for: {brand_name}")

    # ===== 1. CREATE MAIN PAGE =====
    page = create_page(
        PARENT_PAGE_ID,
        f"Клиентски портал {brand_name}",
        icon={"type": "emoji", "emoji": "🏠"}
    )
    page_id = page["id"]
    print(f"  Page created: {page_id}")

    # ===== 2. CREATE CHILD PAGES (under main page) =====
    menu_pages_data = {}
    for title in ["Ресурси", "Месечни Отчети", "Всички Срещи", "Достъп", "FAQs / Често Задавани Въпроси"]:
        p = create_page(page_id, title)
        menu_pages_data[title] = p["id"]
    print("  Child pages created")

    # ===== 3. CREATE DATABASES (under main page) =====
    project_db = create_database(page_id, "Client Project", {
        "Име": {"title": {}},
        "Статус": {
            "select": {
                "options": [
                    {"name": "Планиране", "color": "gray"},
                    {"name": "Дизайн", "color": "blue"},
                    {"name": "Копи", "color": "purple"},
                    {"name": "Билд", "color": "orange"},
                    {"name": "Live", "color": "green"}
                ]
            }
        },
        "Тип": {
            "select": {
                "options": [
                    {"name": "Welcome Flow", "color": "blue"},
                    {"name": "Abandoned Cart", "color": "red"},
                    {"name": "Post-Purchase", "color": "green"},
                    {"name": "Winback", "color": "orange"},
                    {"name": "Browse Abandonment", "color": "purple"},
                    {"name": "Campaign", "color": "pink"}
                ]
            }
        },
        "Дата": {"date": {}}
    })
    project_db_id = project_db["id"]
    print("  Project database created")

    email_cal_db = create_database(page_id, "Имейл Календар", {
        "Име на имейл": {"title": {}},
        "Дата на изпращане": {"date": {}},
        "Статус": {
            "select": {
                "options": [
                    {"name": "Чернова", "color": "gray"},
                    {"name": "За одобрение", "color": "yellow"},
                    {"name": "Одобрен", "color": "blue"},
                    {"name": "Изпратен", "color": "green"}
                ]
            }
        },
        "Език": {
            "multi_select": {
                "options": [
                    {"name": "BG", "color": "green"},
                    {"name": "RO", "color": "blue"},
                    {"name": "GR", "color": "purple"},
                    {"name": "HU", "color": "orange"}
                ]
            }
        },
        "Flow": {
            "select": {
                "options": [
                    {"name": "Welcome", "color": "blue"},
                    {"name": "Abandoned Cart", "color": "red"},
                    {"name": "Post-Purchase", "color": "green"},
                    {"name": "Winback", "color": "orange"},
                    {"name": "Campaign", "color": "pink"}
                ]
            }
        }
    })
    email_cal_db_id = email_cal_db["id"]
    print("  Email calendar database created")

    # ===== 4. ADD MAIN CONTENT BLOCKS =====
    # Welcome header
    welcome = [
        {
            "object": "block", "type": "callout",
            "callout": {
                "rich_text": rt(f"Здравейте, добре дошли в клиентския портал на {brand_name}! "),
                "icon": {"type": "emoji", "emoji": "👋"},
                "children": [
                    {
                        "object": "block", "type": "toggle",
                        "toggle": {
                            "rich_text": rt("Натиснете стрелката, за повече информация. Създал съм този клиентски портал специално за вас."),
                            "children": [
                                {"object": "block", "type": "paragraph", "paragraph": {"rich_text": rt(
                                    "Тук, ще имате възможност да видите целите, които сме си поставили, както и прогреса по тях."
                                )}},
                                {"object": "block", "type": "paragraph", "paragraph": {"rich_text": rt(
                                    "През този портал ще можете да сте постоянно информирани за статуса на имейл кампаниите."
                                )}},
                                {"object": "block", "type": "paragraph", "paragraph": {"rich_text": rt(
                                    "Целя този портал да улесни процеса ни на работа, затова моля за обратна връзка."
                                )}},
                                {"object": "block", "type": "paragraph", "paragraph": {"rich_text": rt(
                                    "Нека постигнем сериозни успехи заедно! 🚀"
                                )}},
                            ]
                        }
                    }
                ]
            }
        },
        {"object": "block", "type": "paragraph", "paragraph": {"rich_text": []}},
        {"object": "block", "type": "divider", "divider": {}},
    ]
    append_blocks(page_id, welcome)
    print("  Welcome section added")

    # ===== 5. TWO-COLUMN LAYOUT =====
    columns = [
        {
            "object": "block", "type": "column_list",
            "column_list": {
                "children": [
                    # LEFT COLUMN (30%) - Главно Меню
                    {
                        "object": "block", "type": "column",
                        "column": {
                            "children": [
                                {
                                    "object": "block", "type": "callout",
                                    "callout": {
                                        "rich_text": rt("Главно Меню"),
                                        "icon": {"type": "emoji", "emoji": "⏩"}
                                    }
                                }
                            ]
                        }
                    },
                    # RIGHT COLUMN (70%) - Процес на работа
                    {
                        "object": "block", "type": "column",
                        "column": {
                            "children": [
                                {
                                    "object": "block", "type": "callout",
                                    "callout": {
                                        "rich_text": rt("Процес на работа"),
                                        "icon": {"type": "emoji", "emoji": "🚀"}
                                    }
                                }
                            ]
                        }
                    }
                ]
            }
        }
    ]
    result = append_blocks(page_id, columns)
    col_list_id = result["results"][0]["id"]
    print("  Column layout added")

    # Get column and callout IDs
    cols = notion_request("GET", f"https://api.notion.com/v1/blocks/{col_list_id}/children")
    left_col_id = cols["results"][0]["id"]
    right_col_id = cols["results"][1]["id"]

    # Get callout IDs inside columns
    left_col_children = notion_request("GET", f"https://api.notion.com/v1/blocks/{left_col_id}/children")
    left_callout_id = left_col_children["results"][0]["id"]

    right_col_children = notion_request("GET", f"https://api.notion.com/v1/blocks/{right_col_id}/children")
    right_callout_id = right_col_children["results"][0]["id"]

    # ===== 6. ADD LINKS TO MENU CALLOUT =====
    menu_links = [{"object": "block", "type": "divider", "divider": {}}]
    for title, pid in menu_pages_data.items():
        menu_links.append({
            "object": "block", "type": "link_to_page",
            "link_to_page": {"type": "page_id", "page_id": pid}
        })
    append_blocks(left_callout_id, menu_links)
    print("  Menu links added to callout")

    # ===== 7. ADD PROJECT DB LINK TO RIGHT CALLOUT =====
    right_content = [
        {"object": "block", "type": "divider", "divider": {}},
        {
            "object": "block", "type": "link_to_page",
            "link_to_page": {"type": "database_id", "database_id": project_db_id}
        }
    ]
    append_blocks(right_callout_id, right_content)
    print("  Project DB linked in right callout")

    # ===== 8. ADD EMAIL CALENDAR SECTION =====
    calendar_section = [
        {
            "object": "block", "type": "callout",
            "callout": {
                "rich_text": rt("Календар с имейли"),
                "icon": {"type": "emoji", "emoji": "📅"}
            }
        }
    ]
    cal_result = append_blocks(right_col_id, calendar_section)
    cal_callout_id = cal_result["results"][0]["id"]

    # Add email calendar DB link inside calendar callout
    append_blocks(cal_callout_id, [
        {"object": "block", "type": "divider", "divider": {}},
        {
            "object": "block", "type": "link_to_page",
            "link_to_page": {"type": "database_id", "database_id": email_cal_db_id}
        }
    ])
    print("  Email calendar section added")

    # ===== 9. ADD BRAND INFO SECTION =====
    brand_info = [
        {"object": "block", "type": "divider", "divider": {}},
        {
            "object": "block", "type": "callout",
            "callout": {
                "rich_text": rt("📝 Информация за бранда"),
                "icon": {"type": "emoji", "emoji": "📝"},
                "children": [
                    {"object": "block", "type": "divider", "divider": {}},
                    {"object": "block", "type": "heading_3", "heading_3": {"rich_text": rt("Описание на бранда")}},
                    {"object": "block", "type": "paragraph", "paragraph": {"rich_text": rt(client_data.get("brand_description", ""))}},
                    {"object": "block", "type": "heading_3", "heading_3": {"rich_text": rt("Какво искат клиентите")}},
                    {"object": "block", "type": "paragraph", "paragraph": {"rich_text": rt(client_data.get("customer_insights", ""))}},
                    {"object": "block", "type": "heading_3", "heading_3": {"rich_text": rt("Желан резултат")}},
                    {"object": "block", "type": "paragraph", "paragraph": {"rich_text": rt(client_data.get("desired_outcome", ""))}},
                    {"object": "block", "type": "heading_3", "heading_3": {"rich_text": rt("Защо нас")}},
                    {"object": "block", "type": "paragraph", "paragraph": {"rich_text": rt(client_data.get("why_us", ""))}},
                    {"object": "block", "type": "heading_3", "heading_3": {"rich_text": rt("Диференциация")}},
                    {"object": "block", "type": "paragraph", "paragraph": {"rich_text": rt(client_data.get("differentiation", ""))}},
                ]
            }
        },
        {
            "object": "block", "type": "callout",
            "callout": {
                "rich_text": rt("📊 USP и предимства"),
                "icon": {"type": "emoji", "emoji": "📊"},
                "children": [
                    {"object": "block", "type": "divider", "divider": {}},
                    {"object": "block", "type": "heading_3", "heading_3": {"rich_text": rt("USP")}},
                    {"object": "block", "type": "paragraph", "paragraph": {"rich_text": rt(client_data.get("usp", ""))}},
                    {"object": "block", "type": "heading_3", "heading_3": {"rich_text": rt("Трудно копируеми предимства")}},
                    {"object": "block", "type": "paragraph", "paragraph": {"rich_text": rt(client_data.get("hard_to_copy", "Не е предоставено"))}},
                    {"object": "block", "type": "heading_3", "heading_3": {"rich_text": rt("Едно изречение - защо да изберат вас")}},
                    {"object": "block", "type": "paragraph", "paragraph": {"rich_text": rt(client_data.get("one_sentence", ""))}},
                ]
            }
        },
        {"object": "block", "type": "divider", "divider": {}},
        {
            "object": "block", "type": "callout",
            "callout": {
                "rich_text": rt("🔗 Достъп и асети"),
                "icon": {"type": "emoji", "emoji": "🔗"},
                "children": [
                    {"object": "block", "type": "divider", "divider": {}},
                    {"object": "block", "type": "paragraph", "paragraph": {"rich_text": rt(f"Уебсайт: {client_data.get('website', '')}")}},
                    {"object": "block", "type": "paragraph", "paragraph": {"rich_text": rt(f"Google Drive: {client_data.get('drive_link', '')}")}},
                    {"object": "block", "type": "paragraph", "paragraph": {"rich_text": rt(f"Брандбук: {client_data.get('brand_guidelines', 'Не е предоставен')}")}},
                    {"object": "block", "type": "paragraph", "paragraph": {"rich_text": rt(f"Езици: {client_data.get('languages', '')}")}},
                    {"object": "block", "type": "paragraph", "paragraph": {"rich_text": rt(f"Одобряващ: {client_data.get('approver_name', '')} ({client_data.get('approver_email', '')})")}},
                ]
            }
        },
        {"object": "block", "type": "divider", "divider": {}},
    ]
    append_blocks(page_id, brand_info)
    print("  Brand info section added")

    print(f"\n✅ Portal created successfully!")
    print(f"URL: {page['url']}")
    return page


if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "--test":
        test_data = {
            "brand_name": "Demo Brand",
            "website": "https://demobrand.bg",
            "brand_description": "Премиум марка за натурална козметика, фокусирана върху устойчиви съставки и минималистичен дизайн.",
            "customer_insights": "Жени 25-45, търсещи чисти продукти без парабени. Искат да се чувстват добре за себе си и планетата.",
            "desired_outcome": "Здрава, сияйна кожа с продукти, на които могат да се доверят.",
            "why_us": "Клиентите казват: 'Най-после козметика, която прави каквото обещава.'",
            "differentiation": "100% натурални съставки, произведени в България, без тестване върху животни.",
            "usp": "Натурално, българско, ефективно. Сертифицирано Ecocert.",
            "hard_to_copy": "Собствена лаборатория, 15 години R&D, патентовани формули с розово масло.",
            "one_sentence": "Натуралната козметика, която работи — от България за света.",
            "drive_link": "https://drive.google.com/drive/folders/example123",
            "brand_guidelines": "Цветове: #2D5016 (зелено), #F5F0EB (крем). Шрифт: Playfair Display. Тон: топъл, автентичен.",
            "languages": "Български, Румънски",
            "approver_name": "Мария Петрова",
            "approver_email": "maria@demobrand.bg"
        }
        create_portal(test_data)
    else:
        input_data = json.loads(sys.stdin.read())
        create_portal(input_data)
