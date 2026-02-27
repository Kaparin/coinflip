'use client';

import { useState } from 'react';
import { Newspaper, Plus, Pencil, Trash2, Eye, EyeOff, Loader2 } from 'lucide-react';
import {
  useAdminNews,
  useAdminCreateNews,
  useAdminUpdateNews,
  useAdminDeleteNews,
  type AdminNewsPost,
} from '@/hooks/use-admin';
import { TableWrapper, Pagination, ActionButton, timeAgo } from '../_shared';

export function NewsTab() {
  const [page, setPage] = useState(0);
  const [showForm, setShowForm] = useState(false);
  const [editingPost, setEditingPost] = useState<AdminNewsPost | null>(null);
  const [actionResult, setActionResult] = useState<string | null>(null);

  const { data, isLoading } = useAdminNews(page);
  const deleteNews = useAdminDeleteNews();

  const rows = data?.data ?? [];
  const pagination = data?.pagination;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 size={24} className="animate-spin text-[var(--color-primary)]" />
      </div>
    );
  }

  const handleDelete = async (id: string) => {
    try {
      await deleteNews.mutateAsync(id);
      setActionResult('Post deleted');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setActionResult(`Error: ${message}`);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Newspaper size={18} className="text-[var(--color-primary)]" />
          <h3 className="text-sm font-bold">News Posts</h3>
        </div>
        <ActionButton onClick={() => { setShowForm(!showForm); setEditingPost(null); }}>
          <span className="flex items-center gap-1">
            <Plus size={12} />
            New Post
          </span>
        </ActionButton>
      </div>

      {/* Result */}
      {actionResult && (
        <div className={`rounded-lg px-4 py-2 text-xs ${actionResult.startsWith('Error') ? 'bg-red-500/10 text-red-400' : 'bg-green-500/10 text-green-400'}`}>
          {actionResult}
        </div>
      )}

      {/* Create / Edit Form */}
      {(showForm || editingPost) && (
        <NewsForm
          post={editingPost}
          onSuccess={(msg) => {
            setShowForm(false);
            setEditingPost(null);
            setActionResult(msg);
          }}
          onCancel={() => { setShowForm(false); setEditingPost(null); }}
          onError={(msg) => setActionResult(`Error: ${msg}`)}
        />
      )}

      {/* Posts Table */}
      {rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[var(--color-border)] py-8 text-center">
          <p className="text-xs text-[var(--color-text-secondary)]">No news posts yet</p>
        </div>
      ) : (
        <TableWrapper>
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-[var(--color-border)] bg-[var(--color-bg)]">
                <th className="px-3 py-2 text-left font-medium text-[var(--color-text-secondary)]">Title</th>
                <th className="px-3 py-2 text-center font-medium text-[var(--color-text-secondary)]">Type</th>
                <th className="px-3 py-2 text-center font-medium text-[var(--color-text-secondary)]">Priority</th>
                <th className="px-3 py-2 text-center font-medium text-[var(--color-text-secondary)]">Status</th>
                <th className="px-3 py-2 text-right font-medium text-[var(--color-text-secondary)]">Published</th>
                <th className="px-3 py-2 text-right font-medium text-[var(--color-text-secondary)]">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((post) => (
                <tr key={post.id} className="border-b border-[var(--color-border)] last:border-0">
                  <td className="px-3 py-2 font-medium max-w-[250px] truncate">{post.title}</td>
                  <td className="px-3 py-2 text-center">
                    <span className="inline-block rounded-full px-2 py-0.5 text-[10px] font-bold bg-[var(--color-primary)]/15 text-[var(--color-primary)]">
                      {post.type}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-center">
                    <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                      post.priority === 'important'
                        ? 'bg-amber-500/15 text-amber-400'
                        : 'bg-[var(--color-primary)]/15 text-[var(--color-primary)]'
                    }`}>
                      {post.priority}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-center">
                    {post.isPublished === 1 ? (
                      <span className="inline-flex items-center gap-1 text-green-400">
                        <Eye size={12} /> Published
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[var(--color-text-secondary)]">
                        <EyeOff size={12} /> Draft
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right text-[var(--color-text-secondary)]">{timeAgo(post.publishedAt)}</td>
                  <td className="px-3 py-2 text-right">
                    <div className="flex justify-end gap-1">
                      <ActionButton onClick={() => { setEditingPost(post); setShowForm(false); }}>
                        <Pencil size={12} />
                      </ActionButton>
                      <ActionButton onClick={() => handleDelete(post.id)} variant="danger" disabled={deleteNews.isPending}>
                        <Trash2 size={12} />
                      </ActionButton>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {pagination && pagination.total > 0 && (
            <Pagination
              page={page}
              total={pagination.total}
              limit={pagination.limit}
              hasMore={pagination.hasMore}
              onPageChange={setPage}
            />
          )}
        </TableWrapper>
      )}
    </div>
  );
}

function NewsForm({
  post,
  onSuccess,
  onCancel,
  onError,
}: {
  post: AdminNewsPost | null;
  onSuccess: (msg: string) => void;
  onCancel: () => void;
  onError: (msg: string) => void;
}) {
  const createNews = useAdminCreateNews();
  const updateNews = useAdminUpdateNews();

  const [title, setTitle] = useState(post?.title ?? '');
  const [content, setContent] = useState(post?.content ?? '');
  const [type, setType] = useState(post?.type ?? 'update');
  const [priority, setPriority] = useState(post?.priority ?? 'normal');
  const [isPublished, setIsPublished] = useState(post ? post.isPublished === 1 : true);

  const handleSubmit = async () => {
    if (!title.trim() || !content.trim()) return;
    try {
      if (post) {
        await updateNews.mutateAsync({
          id: post.id,
          title: title.trim(),
          content: content.trim(),
          priority,
          isPublished: isPublished ? 1 : 0,
        });
        onSuccess('Post updated');
      } else {
        await createNews.mutateAsync({
          type,
          title: title.trim(),
          content: content.trim(),
          priority,
        });
        onSuccess('Post created');
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      onError(message);
    }
  };

  const isPending = createNews.isPending || updateNews.isPending;

  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 space-y-4">
      <h3 className="text-sm font-bold">{post ? 'Edit Post' : 'New Post'}</h3>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className="block text-[10px] font-medium text-[var(--color-text-secondary)] mb-1">Title</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Post title..."
            maxLength={200}
            className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm focus:border-[var(--color-primary)] focus:outline-none"
          />
        </div>

        <div>
          <label className="block text-[10px] font-medium text-[var(--color-text-secondary)] mb-1">Type</label>
          <select
            value={type}
            onChange={(e) => setType(e.target.value)}
            disabled={!!post}
            className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm disabled:opacity-50"
          >
            <option value="update">Update</option>
            <option value="announcement">Announcement</option>
          </select>
        </div>

        <div>
          <label className="block text-[10px] font-medium text-[var(--color-text-secondary)] mb-1">Priority</label>
          <select
            value={priority}
            onChange={(e) => setPriority(e.target.value)}
            className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm"
          >
            <option value="normal">Normal</option>
            <option value="important">Important</option>
          </select>
        </div>

        <div className="sm:col-span-2">
          <label className="block text-[10px] font-medium text-[var(--color-text-secondary)] mb-1">Content</label>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Write your post content..."
            maxLength={5000}
            rows={5}
            className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm focus:border-[var(--color-primary)] focus:outline-none resize-none"
          />
          <p className="text-[10px] text-[var(--color-text-secondary)] mt-0.5">{content.length}/5000</p>
        </div>
      </div>

      {post && (
        <div className="flex items-center gap-2">
          <label className="text-xs text-[var(--color-text-secondary)]">Published</label>
          <button
            type="button"
            onClick={() => setIsPublished(!isPublished)}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              isPublished ? 'bg-green-500' : 'bg-[var(--color-border)]'
            }`}
          >
            <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
              isPublished ? 'translate-x-6' : 'translate-x-1'
            }`} />
          </button>
        </div>
      )}

      <div className="flex gap-2">
        <ActionButton onClick={handleSubmit} variant="success" disabled={isPending || !title.trim() || !content.trim()}>
          {isPending ? 'Saving...' : (post ? 'Update Post' : 'Create Post')}
        </ActionButton>
        <ActionButton onClick={onCancel}>Cancel</ActionButton>
      </div>
    </div>
  );
}
