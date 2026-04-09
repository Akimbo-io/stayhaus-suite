#!/bin/bash
export NOTION_TOKEN="ntn_f62867633736B57p97ZW7tB8AOwXdxP2Jbq505nW3A366v"
export PARENT_PAGE_ID="33d176b8656d80e6ad17faaf4d4884e0"
cd "$(dirname "$0")"
node dev-server.js
