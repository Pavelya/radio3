# AI Radio 2525 - Admin Portal

Next.js-based admin portal for managing AI Radio 2525 content, DJs, segments, and monitoring.

## Features

- Supabase authentication with email/password
- Protected routes with middleware
- Dashboard with stats overview
- Navigation for Content, DJs, Segments, and Monitoring

## Development

```bash
# Start the dev server
pnpm dev

# Build for production
pnpm build

# Start production server
pnpm start
```

The admin portal runs on port 3001 by default.

## Environment Variables

Copy [.env.example](.env.example) to `.env.local` and update with your Supabase credentials:

```bash
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
NEXT_PUBLIC_APP_URL=http://localhost:3001
```

## Authentication

To access the admin portal, you need to create a user in your Supabase project:

1. Go to your Supabase dashboard
2. Navigate to Authentication > Users
3. Create a new user with email/password
4. Use those credentials to log in to the admin portal

## Structure

```
apps/admin/
├── app/
│   ├── auth/signout/     # Sign out API route
│   ├── dashboard/        # Main dashboard pages
│   ├── login/            # Login page
│   └── layout.tsx        # Root layout
├── lib/
│   ├── supabase.ts       # Browser Supabase client
│   └── supabase-server.ts # Server Supabase client
└── middleware.ts         # Authentication middleware
```

## Next Steps

- Implement Content Management (Task A2)
- Add DJ Management interface
- Create Segment browser
- Build Monitoring dashboard
