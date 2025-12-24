# SEO & Metadata Guidelines

## 1. Global Defaults
Global SEO defaults are managed in `nuxt.config.ts`. Always ensure these are present:
- `titleTemplate`: Use `%s - Coach Watts` for consistent branding.
- `og:site_name`: Set to `Coach Watts`.
- `twitter:card`: Set to `summary_large_image` for rich social previews.

## 2. Page-Specific SEO (`useHead`)
All pages should use the `useHead()` composable to define their metadata.

### Rule: Use Computed Values for Dynamic Pages
For pages that fetch data, use `computed` properties for titles and descriptions to ensure they update correctly.

### Rule: Support SSR for Shared Pages
Publicly shareable pages **MUST** use `await useFetch` at the top level (setup script) instead of `onMounted` or client-side fetches. This allows social media crawlers (which don't execute JS) to read the metadata.

**✅ Correct Pattern:**
```typescript
<script setup lang="ts">
const { data: profile } = await useFetch('/api/share/profile/...')

const title = computed(() => profile.value?.name + ' | Coach Watts')

useHead({
  title,
  meta: [
    { name: 'description', content: computed(() => profile.value?.bio) },
    { property: 'og:title', content: title },
    { property: 'og:type', content: 'profile' }
  ]
})
</script>
```

## 3. Open Graph (OG) Tags
Always include the following OG tags for better social media integration:
- `og:title`: Match the page title.
- `og:description`: A concise summary (max 160 chars).
- `og:type`: Use `website`, `article`, or `profile` as appropriate.
- `og:image`: (Optional) Path to a relevant preview image.

## 4. JSON-LD Structured Data
For important public pages (Profiles, Workouts, Articles), include structured data using the `script` property in `useHead`.

**Example for a Profile:**
```typescript
useHead({
  script: [
    {
      type: 'application/ld+json',
      children: JSON.stringify({
        '@context': 'https://schema.org',
        '@type': 'ProfilePage',
        'mainEntity': {
          '@type': 'Person',
          'name': 'Athlete Name'
        }
      })
    }
  ]
})
```

## 5. Twitter Metadata
Always mirror OG tags with Twitter-specific tags:
- `twitter:title`
- `twitter:description`
- `twitter:image`
