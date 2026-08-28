# Recipes

Per-site filler recipes. After you build a working filler for a site, copy the relevant selectors and config here so future runs skip discovery.

## Recipe shape

```js
// recipes/wordpress.mjs
export default {
  url: 'https://example.com/wp-admin/post-new.php',
  fieldMap: {
    title: { kind: 'label', name: 'Add title' },
    body:  { kind: 'role',  role: 'textbox', name: 'Block: Paragraph' },
    tags:  { kind: 'label', name: 'Tags' },
  },
  saveSelector: "role=button[name=/^save draft$/i]",
  successAssertion: 'text=/draft saved|post draft updated/i',
  notes: 'Block editor — body field is per-block, target the first paragraph block.',
};
```

Recipes are reused by passing `--recipe wordpress` to the filler script (extend the template to support this).
