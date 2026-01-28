# PO Management Frontend

Next.js 14 frontend for the Purchase Order Management System.

## Getting Started

1. Install dependencies:
```bash
npm install
```

2. Start the development server:
```bash
npm run dev
```

3. Open [http://localhost:3000](http://localhost:3000) in your browser.

## Prerequisites

- Node.js 18+
- Backend API running on `http://localhost:8000`

## Project Structure

```
src/
├── app/                    # Next.js App Router pages
│   ├── page.tsx           # Login page (/)
│   ├── dashboard/         # Dashboard (/dashboard)
│   ├── orders/            # Orders table (/orders)
│   └── settings/          # Settings (/settings)
├── components/
│   ├── layout/            # Navbar, AuthProvider
│   └── orders/            # OrderTable, EditableCell, CommentSidebar
├── lib/
│   ├── api.ts             # API client (axios)
│   ├── websocket.ts       # WebSocket client
│   └── utils.ts           # Utility functions
├── store/
│   └── useStore.ts        # Zustand state management
└── types/
    └── index.ts           # TypeScript types
```

## Features

- **Role-based access**: Internal users see all columns, suppliers see limited view
- **Inline editing**: Double-click cells to edit (role-based permissions)
- **Real-time updates**: WebSocket connection for live order updates
- **Excel import/export**: Download/upload orders (import for internal only)
- **Comment system**: Add comments to orders with sidebar panel
- **Responsive design**: Works on desktop and mobile

## User Roles

### Internal Users
- View ALL columns
- Edit ANY cell
- Upload Excel files
- Add comments

### Supplier Users
- Hidden columns: System PO#, Cost Price, Order Value, Order Received, Del to Customer
- Can only edit: Date Approved to Prod, Revised Ex-Factory, Actual Del UK
- Cannot upload Excel
- Can add comments
