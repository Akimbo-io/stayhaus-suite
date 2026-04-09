#!/bin/bash

# Start Image Translator (ports 8001/3001 to coexist with video translator)

echo "Starting Image Translator..."

# Start backend on port 8001
cd "$(dirname "$0")/backend"
/Users/valentinandreev/Library/Python/3.9/bin/uvicorn main:app --host 0.0.0.0 --port 8001 &
BACKEND_PID=$!
echo "Backend started (PID: $BACKEND_PID)"

# Start frontend on port 3001
cd "$(dirname "$0")/frontend"
PORT=3001 npm run dev &
FRONTEND_PID=$!
echo "Frontend started (PID: $FRONTEND_PID)"

echo ""
echo "Image Translator is running!"
echo "Frontend: http://localhost:3001"
echo "Backend:  http://localhost:8001"
echo ""
echo "Press Ctrl+C to stop both servers"

# Wait for Ctrl+C
trap "kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; exit" SIGINT SIGTERM
wait
