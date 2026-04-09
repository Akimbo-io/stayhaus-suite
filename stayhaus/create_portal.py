"""
StayHaus - Create Client Portal in Notion
Creates a clean, professionally styled client workspace.
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


def create_page(parent_id, title, icon=None, cover=None):
    data = {
        "parent": {"type": "page_id", "page_id": parent_id},
        "properties": {"title": [{"text": {"content": title}}]}
    }
    if icon:
        data["icon"] = icon
    if cover:
        data["cover"] = cover
    return notion_request("POST", "https://api.notion.com/v1/pages", data)


def create_database(parent_id, title, properties, icon=None):
    data = {
        "parent": {"type": "page_id", "page_id": parent_id},
        "title": [{"text": {"content": title}}],
        "properties": properties
    }
    if icon:
        data["icon"] = icon
    return notion_request("POST", "https://api.notion.com/v1/databases", data)


def append_blocks(block_id, children):
    data = {"children": children}
    return notion_request("PATCH",
        f"https://api.notion.com/v1/blocks/{block_id}/children", data)


# --- Rich text helpers ---

def rt(content, bold=False, italic=False, color="default", code=False):
    """Single rich text segment with formatting."""
    return [{
        "type": "text",
        "text": {"content": content},
        "annotations": {
            "bold": bold, "italic": italic, "strikethrough": False,
            "underline": False, "code": code, "color": color
        }
    }]


def rt_link(content, url, bold=False, color="default"):
    """Rich text segment that is a clickable link."""
    return [{
        "type": "text",
        "text": {"content": content, "link": {"url": url}},
        "annotations": {
            "bold": bold, "italic": False, "strikethrough": False,
            "underline": False, "code": False, "color": color
        }
    }]


def rt_multi(*segments):
    """Combine multiple rich text segments into one array."""
    result = []
    for seg in segments:
        if isinstance(seg, list):
            result.extend(seg)
        else:
            result.append(seg)
    return result


def labeled_row(label, value):
    """A paragraph with bold label + normal value text."""
    if not value:
        value = "—"
    return {
        "object": "block", "type": "paragraph",
        "paragraph": {
            "rich_text": rt_multi(
                rt(f"{label}  ", bold=True, color="default"),
                rt(value, color="default")
            )
        }
    }


def labeled_link_row(label, url):
    """A paragraph with bold label + clickable link."""
    if not url:
        return labeled_row(label, "—")
    return {
        "object": "block", "type": "paragraph",
        "paragraph": {
            "rich_text": rt_multi(
                rt(f"{label}  ", bold=True),
                rt_link(url, url, color="blue")
            )
        }
    }


# --- Block helpers ---

def heading(level, text, color="default", toggleable=False):
    key = f"heading_{level}"
    block = {
        "object": "block", "type": key,
        key: {"rich_text": rt(text, bold=True), "color": color}
    }
    if toggleable:
        block[key]["is_toggleable"] = True
    return block


def paragraph(text="", color="default", bold=False, italic=False):
    if not text:
        return {"object": "block", "type": "paragraph",
                "paragraph": {"rich_text": []}}
    return {
        "object": "block", "type": "paragraph",
        "paragraph": {"rich_text": rt(text, bold=bold, italic=italic, color=color)}
    }


def callout(text, color="gray_background", icon_emoji=None, children=None):
    block = {
        "object": "block", "type": "callout",
        "callout": {
            "rich_text": rt(text, bold=True),
            "color": color,
        }
    }
    if icon_emoji:
        block["callout"]["icon"] = {"type": "emoji", "emoji": icon_emoji}
    if children:
        block["callout"]["children"] = children
    return block


def divider():
    return {"object": "block", "type": "divider", "divider": {}}


def quote(text, color="default"):
    return {
        "object": "block", "type": "quote",
        "quote": {"rich_text": rt(text, italic=True), "color": color}
    }


def toggle(text, children, color="default"):
    return {
        "object": "block", "type": "toggle",
        "toggle": {
            "rich_text": rt(text, bold=True),
            "color": color,
            "children": children
        }
    }


def create_portal(client_data):
    brand_name = client_data.get("brand_name", "Нов Клиент")
    print(f"Creating portal for: {brand_name}")

    # ===== 1. MAIN PAGE — just the brand name, clean =====
    page = create_page(PARENT_PAGE_ID, brand_name)
    page_id = page["id"]
    print(f"  Page created: {page_id}")

    # ===== 2. CHILD PAGES =====
    child_pages = {}
    child_page_config = [
        ("Ресурси", "blue_background"),
        ("Месечни Отчети", "green_background"),
        ("Всички Срещи", "purple_background"),
        ("Достъп", "red_background"),
        ("FAQ", "gray_background"),
    ]
    for title, _ in child_page_config:
        p = create_page(page_id, title)
        child_pages[title] = p["id"]
    print("  Child pages created")

    # ===== 2b. KLAVIYO KEY → Достъп page =====
    klaviyo_key = client_data.get("klaviyo_api_key", "")
    if klaviyo_key and "Достъп" in child_pages:
        append_blocks(child_pages["Достъп"], [
            heading(2, "Klaviyo", color="red"),
            labeled_row("API ключ", klaviyo_key),
            paragraph(),
            callout(
                "Не споделяйте този ключ публично. Използва се от автоматизацията за достъп до Klaviyo.",
                color="red_background"
            ),
        ])
        print("  Klaviyo key stored in Access page")

    # ===== 3. DATABASES =====
    project_db = create_database(page_id, "Проекти", {
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

    email_db = create_database(page_id, "Имейл Календар", {
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
    email_db_id = email_db["id"]
    print("  Email calendar database created")

    # ===== 4. WELCOME SECTION =====
    welcome_blocks = [
        quote(f"Добре дошли в работното пространство на {brand_name}. "
              "Тук ще намерите всичко за нашата съвместна работа — "
              "проекти, имейл календар, ресурси и отчети.",
              color="purple_background"),
        paragraph(),
        divider(),
    ]
    append_blocks(page_id, welcome_blocks)
    print("  Welcome section added")

    # ===== 5. TWO-COLUMN LAYOUT =====
    columns = [{
        "object": "block", "type": "column_list",
        "column_list": {
            "children": [
                {
                    "object": "block", "type": "column",
                    "column": {
                        "children": [
                            callout("Навигация", color="blue_background",
                                    children=[divider()])
                        ]
                    }
                },
                {
                    "object": "block", "type": "column",
                    "column": {
                        "children": [
                            callout("Процес на работа", color="green_background",
                                    children=[divider()])
                        ]
                    }
                }
            ]
        }
    }]
    result = append_blocks(page_id, columns)
    col_list_id = result["results"][0]["id"]
    print("  Column layout added")

    # Get column IDs
    cols = notion_request("GET",
        f"https://api.notion.com/v1/blocks/{col_list_id}/children")
    left_col_id = cols["results"][0]["id"]
    right_col_id = cols["results"][1]["id"]

    # Get callout IDs
    left_children = notion_request("GET",
        f"https://api.notion.com/v1/blocks/{left_col_id}/children")
    left_callout_id = left_children["results"][0]["id"]

    right_children = notion_request("GET",
        f"https://api.notion.com/v1/blocks/{right_col_id}/children")
    right_callout_id = right_children["results"][0]["id"]

    # ===== 6. MENU LINKS (left column) =====
    menu_links = []
    for title, _ in child_page_config:
        menu_links.append({
            "object": "block", "type": "link_to_page",
            "link_to_page": {"type": "page_id", "page_id": child_pages[title]}
        })
    append_blocks(left_callout_id, menu_links)
    print("  Navigation links added")

    # ===== 7. PROJECT DB (right column) =====
    append_blocks(right_callout_id, [{
        "object": "block", "type": "link_to_page",
        "link_to_page": {"type": "database_id", "database_id": project_db_id}
    }])
    print("  Project DB linked")

    # Email calendar in right column
    cal_callout = callout("Имейл Календар", color="yellow_background",
                          children=[divider()])
    cal_result = append_blocks(right_col_id, [cal_callout])
    cal_callout_id = cal_result["results"][0]["id"]
    append_blocks(cal_callout_id, [{
        "object": "block", "type": "link_to_page",
        "link_to_page": {"type": "database_id", "database_id": email_db_id}
    }])
    print("  Email calendar linked")

    # ===== 8. BRAND INFO (toggle sections — collapsed by default) =====
    brand_section = [
        divider(),
        heading(2, "За бранда", color="purple"),
        paragraph(),
        toggle("Описание и клиенти", [
            heading(3, "Описание на бранда", color="gray"),
            paragraph(client_data.get("brand_description", "—")),
            paragraph(),
            heading(3, "Познания за клиентите", color="gray"),
            paragraph(client_data.get("customer_insights", "—")),
            paragraph(),
            heading(3, "Желан резултат", color="gray"),
            paragraph(client_data.get("desired_outcome", "—")),
        ]),
        toggle("Защо нас и диференциация", [
            heading(3, "Защо клиентите ни избират", color="gray"),
            paragraph(client_data.get("why_us", "—")),
            paragraph(),
            heading(3, "Какво ни отличава", color="gray"),
            paragraph(client_data.get("differentiation", "—")),
        ]),
        toggle("USP и предимства", [
            heading(3, "Уникално предложение (USP)", color="gray"),
            paragraph(client_data.get("usp", "—")),
            paragraph(),
            heading(3, "Трудно копируеми предимства", color="gray"),
            paragraph(client_data.get("hard_to_copy", "—")),
            paragraph(),
            callout(client_data.get("one_sentence", "—"),
                    color="purple_background"),
        ]),
    ]
    append_blocks(page_id, brand_section)
    print("  Brand info section added")

    # ===== 9. ACCESS & ASSETS =====
    website = client_data.get("website", "")
    drive_link = client_data.get("drive_link", "")

    access_section = [
        divider(),
        heading(2, "Достъп и асети", color="blue"),
        paragraph(),
        labeled_link_row("Уебсайт", website),
        labeled_link_row("Google Drive", drive_link),
        labeled_row("Брандбук",
                     client_data.get("brand_guidelines", "—")),
        labeled_row("Езици", client_data.get("languages", "—")),
        paragraph(),
        callout(
            f"Одобряващ: {client_data.get('approver_name', '—')}",
            color="blue_background",
            children=[
                paragraph(client_data.get("approver_email", "—"), color="gray"),
            ]
        ),
        divider(),
        paragraph("Създадено от StayHaus", color="gray", italic=True),
    ]
    append_blocks(page_id, access_section)
    print("  Access section added")

    print(f"\nPortal created successfully!")
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
            "approver_email": "maria@demobrand.bg",
            "klaviyo_api_key": "pk_test_1234567890abcdef"
        }
        create_portal(test_data)
    else:
        raw = sys.stdin.buffer.read().decode('utf-8')
        input_data = json.loads(raw)
        create_portal(input_data)
