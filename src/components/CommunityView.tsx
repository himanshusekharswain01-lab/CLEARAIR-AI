import React, { useEffect, useState } from 'react';
import { Flag, MessageSquare, Shield, ThumbsUp, Trash2, AlertCircle } from 'lucide-react';
import type {
  AuthUser,
  CommunityPost,
  CommunityReport,
  LanguageCode,
  LocationOption,
} from '../shared/types.ts';
import { UI_COPY } from '../shared/i18n.ts';
import { api } from '../services/api.ts';

interface CommunityViewProps {
  location: LocationOption;
  language: LanguageCode;
  user: AuthUser | null;
  onOpenAuth: () => void;
}

export const CommunityView: React.FC<CommunityViewProps> = ({
  location,
  language,
  user,
  onOpenAuth,
}) => {
  const copy = UI_COPY[language];
  const [posts, setPosts] = useState<CommunityPost[]>([]);
  const [filterType, setFilterType] = useState('all');
  const [cityFilter, setCityFilter] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Composer state
  const [postType, setPostType] = useState<'observation' | 'initiative'>('observation');
  const [category, setCategory] = useState('visible_smoke');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [areaLabel, setAreaLabel] = useState('');
  const [city, setCity] = useState(location.name);
  const [submitting, setSubmitting] = useState(false);
  const [submitMsg, setSubmitMsg] = useState<string | null>(null);

  // Comments & Reports state
  const [expandedPostId, setExpandedPostId] = useState<string | null>(null);
  const [commentText, setCommentText] = useState('');
  const [reportingPostId, setReportingPostId] = useState<string | null>(null);
  const [reportReason, setReportReason] = useState('misinformation');
  const [reportDetails, setReportDetails] = useState('');

  // Moderator queue state
  const [reports, setReports] = useState<CommunityReport[]>([]);
  const [showModQueue, setShowModQueue] = useState(false);

  const isModerator = user?.role === 'moderator' || user?.role === 'admin';

  useEffect(() => {
    setCity(location.name);
  }, [location.name]);

  const loadPosts = () => {
    setLoading(true);
    setError(null);
    api
      .listCommunityPosts(filterType, cityFilter)
      .then((res) => setPosts(res.posts))
      .catch((err) => setError(err instanceof Error ? err.message : 'Unable to load community posts.'))
      .finally(() => setLoading(false));
  };

  const loadReports = () => {
    if (!isModerator) return;
    api
      .listModerationReports()
      .then((res) => setReports(res.reports))
      .catch(() => {});
  };

  useEffect(() => {
    loadPosts();
  }, [filterType, cityFilter, user?.id]);

  useEffect(() => {
    loadReports();
  }, [isModerator, showModQueue]);

  const handleCreatePost = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      onOpenAuth();
      return;
    }
    setSubmitting(true);
    setSubmitMsg(null);
    try {
      await api.createCommunityPost({ postType, category, title, body, areaLabel, city });
      setTitle('');
      setBody('');
      setAreaLabel('');
      setSubmitMsg('Shared with the community and labeled as user-generated.');
      loadPosts();
    } catch (err) {
      setSubmitMsg(err instanceof Error ? err.message : 'Unable to publish post.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleVote = async (postId: string) => {
    if (!user) {
      onOpenAuth();
      return;
    }
    try {
      const res = await api.togglePostVote(postId);
      setPosts((prev) =>
        prev.map((p) =>
          p.id === postId
            ? { ...p, upvoteCount: res.upvoteCount, viewerHasUpvoted: res.viewerHasUpvoted }
            : p
        )
      );
    } catch {}
  };

  const handleComment = async (postId: string) => {
    if (!user) {
      onOpenAuth();
      return;
    }
    if (commentText.trim().length < 2) return;
    try {
      const res = await api.addPostComment(postId, commentText);
      setCommentText('');
      setPosts((prev) =>
        prev.map((p) =>
          p.id === postId
            ? {
                ...p,
                commentCount: p.commentCount + 1,
                comments: [...(p.comments ?? []), res.comment],
              }
            : p
        )
      );
    } catch {}
  };

  const handleSubmitReport = async (postId: string) => {
    if (!user) {
      onOpenAuth();
      return;
    }
    try {
      await api.reportPost(postId, reportReason, reportDetails);
      setReportingPostId(null);
      setReportDetails('');
      loadPosts();
      if (isModerator) loadReports();
    } catch {}
  };

  const handleDeletePost = async (postId: string) => {
    try {
      await api.deleteCommunityPost(postId);
      loadPosts();
    } catch {}
  };

  const handleModerate = async (reportId: string, action: 'approve_post' | 'hide_post' | 'dismiss_report') => {
    try {
      await api.moderateReport(reportId, action, `Reviewed by ${user?.displayName ?? 'moderator'}`);
      loadReports();
      loadPosts();
    } catch {}
  };

  return (
    <div className="space-y-6">
      {/* Mandatory Distinction Notice */}
      <section className="rounded-xl border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 p-4 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-amber-700 dark:text-amber-300 shrink-0 mt-0.5" aria-hidden="true" />
          <div className="text-xs text-amber-900 dark:text-amber-200 leading-relaxed">
            <p className="font-semibold">{copy.userGeneratedWarning}</p>
            <p className="mt-0.5">
              Community reports describe neighborhood observations (smoke, odors, dust) and clean-air projects. They are NOT official AQI measurements. Never include personal home addresses, phone numbers, or private household details.
            </p>
          </div>
        </div>

        {isModerator && (
          <button
            type="button"
            onClick={() => setShowModQueue((v) => !v)}
            className="inline-flex items-center gap-2 rounded-lg bg-slate-900 dark:bg-slate-100 px-3.5 py-2 text-xs font-medium text-white dark:text-slate-900 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Shield className="w-3.5 h-3.5" aria-hidden="true" />
            Moderator Queue ({reports.filter((r) => r.status === 'open').length})
          </button>
        )}
      </section>

      {/* Moderator Queue Panel */}
      {isModerator && showModQueue && (
        <section className="rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 p-5 space-y-4">
          <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
            Moderation Queue & Flagged Posts
          </h3>
          {reports.length === 0 ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">No reports in the moderation queue.</p>
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {reports.map((rep) => (
                <li key={rep.id} className="py-3 flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{rep.postTitle}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      Reason: {rep.reason.replace('_', ' ')} · Report status: {rep.status} · Post status: {rep.postStatus}
                    </p>
                    {rep.details && <p className="text-xs text-slate-600 dark:text-slate-300 mt-1">{rep.details}</p>}
                  </div>
                  {rep.status === 'open' && (
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleModerate(rep.id, 'approve_post')}
                        className="rounded-lg border border-emerald-300 dark:border-emerald-700 px-3 py-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 cursor-pointer"
                      >
                        Approve Post
                      </button>
                      <button
                        type="button"
                        onClick={() => handleModerate(rep.id, 'hide_post')}
                        className="rounded-lg bg-rose-600 hover:bg-rose-700 px-3 py-1.5 text-xs font-medium text-white cursor-pointer"
                      >
                        Hide Post
                      </button>
                      <button
                        type="button"
                        onClick={() => handleModerate(rep.id, 'dismiss_report')}
                        className="rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 cursor-pointer"
                      >
                        Dismiss
                      </button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left: Share Observation or Initiative */}
        <form
          onSubmit={handleCreatePost}
          className="lg:col-span-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4"
        >
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              Share Local Observation or Initiative
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Area-level only · Auto-labeled as user-generated
            </p>
          </div>

          <div className="grid grid-cols-2 gap-1 p-1 rounded-lg bg-slate-100 dark:bg-slate-800">
            <button
              type="button"
              onClick={() => {
                setPostType('observation');
                setCategory('visible_smoke');
              }}
              className={`py-1.5 rounded-md text-xs font-medium cursor-pointer ${
                postType === 'observation'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              Local Observation
            </button>
            <button
              type="button"
              onClick={() => {
                setPostType('initiative');
                setCategory('clean_air_zone');
              }}
              className={`py-1.5 rounded-md text-xs font-medium cursor-pointer ${
                postType === 'initiative'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              Clean-Air Initiative
            </button>
          </div>

          <label className="block text-xs text-slate-600 dark:text-slate-300">
            Category
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-xs text-slate-900 dark:text-slate-100"
            >
              {postType === 'observation' ? (
                <>
                  <option value="visible_smoke">Visible smoke or haze</option>
                  <option value="unusual_odor">Unusual chemical or burning odor</option>
                  <option value="construction_dust">Construction or road dust</option>
                  <option value="traffic_idling">Heavy idling or congestion</option>
                </>
              ) : (
                <>
                  <option value="clean_air_zone">School no-idling / clean-air zone</option>
                  <option value="tree_planting">Urban greenery & windbreak buffer</option>
                  <option value="filter_drive">Community HEPA / mask drive</option>
                  <option value="carpool_network">Neighborhood carpool / walking bus</option>
                </>
              )}
            </select>
          </label>

          <label className="block text-xs text-slate-600 dark:text-slate-300">
            Headline
            <input
              type="text"
              required
              minLength={5}
              maxLength={120}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={
                postType === 'observation'
                  ? 'e.g., Wood-smoke haze along Riverfront walk'
                  : 'e.g., School walking-bus group launched'
              }
              className="mt-1 w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-xs text-slate-900 dark:text-slate-100"
            />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="block text-xs text-slate-600 dark:text-slate-300">
              Neighborhood / Ward
              <input
                type="text"
                required
                minLength={2}
                maxLength={80}
                value={areaLabel}
                onChange={(e) => setAreaLabel(e.target.value)}
                placeholder="e.g., Oakridge Ward"
                className="mt-1 w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-xs text-slate-900 dark:text-slate-100"
              />
            </label>
            <label className="block text-xs text-slate-600 dark:text-slate-300">
              City
              <input
                type="text"
                required
                minLength={2}
                maxLength={80}
                value={city}
                onChange={(e) => setCity(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-xs text-slate-900 dark:text-slate-100"
              />
            </label>
          </div>

          <label className="block text-xs text-slate-600 dark:text-slate-300">
            Details (omit street numbers & personal info)
            <textarea
              required
              minLength={15}
              maxLength={1200}
              rows={4}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Describe what you observed, time window, or community action results..."
              className="mt-1 w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-xs text-slate-900 dark:text-slate-100"
            />
          </label>

          {submitMsg && <p className="text-xs text-sky-700 dark:text-sky-300">{submitMsg}</p>}

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-lg bg-sky-600 hover:bg-sky-700 px-4 py-2 text-xs font-medium text-white cursor-pointer"
          >
            {user ? (submitting ? 'Publishing...' : 'Publish to Community') : 'Sign In to Post'}
          </button>
        </form>

        {/* Right: Community Feed */}
        <div className="lg:col-span-8 space-y-4">
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-1 p-1 rounded-lg bg-slate-100 dark:bg-slate-800">
              {[
                { id: 'all', label: 'All Feed' },
                { id: 'observation', label: 'Observations' },
                { id: 'initiative', label: 'Initiatives' },
                { id: 'public_bulletin', label: 'Public Bulletins' },
              ].map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setFilterType(item.id)}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium whitespace-nowrap shrink-0 cursor-pointer ${
                    filterType === item.id
                      ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm'
                      : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>

            <input
              type="search"
              value={cityFilter}
              onChange={(e) => setCityFilter(e.target.value)}
              placeholder="Filter by city..."
              aria-label="Filter community posts by city"
              className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-1.5 text-xs text-slate-900 dark:text-slate-100 w-full sm:w-48"
            />
          </div>

          {error && (
            <div className="rounded-xl border border-rose-300 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/40 p-4 text-sm text-rose-800 dark:text-rose-200">
              {error}
            </div>
          )}

          {loading ? (
            <div className="h-48 rounded-xl bg-slate-200 dark:bg-slate-800 animate-pulse" />
          ) : posts.length === 0 ? (
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-8 text-center text-sm text-slate-500 dark:text-slate-400">
              No community posts match your current filter.
            </div>
          ) : (
            <div className="space-y-4">
              {posts.map((post) => (
                <article
                  key={post.id}
                  className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
                    <span>
                      <strong className="font-medium text-slate-700 dark:text-slate-200">
                        {post.sourceLabel}
                      </strong>
                      <span aria-hidden="true"> · </span>
                      {post.areaLabel}, {post.city}
                      <span aria-hidden="true"> · </span>
                      {new Date(post.createdAt).toLocaleDateString()}
                    </span>
                    {post.status === 'flagged' && (
                      <span className="font-mono text-amber-700 dark:text-amber-300">Under Moderator Review</span>
                    )}
                    {post.status === 'hidden' && (
                      <span className="font-mono text-rose-700 dark:text-rose-300">Hidden by Moderator</span>
                    )}
                  </div>

                  <h3 className="mt-2 text-base font-semibold text-slate-900 dark:text-slate-100">{post.title}</h3>
                  <p className="mt-1.5 text-sm text-slate-700 dark:text-slate-300 leading-relaxed">{post.body}</p>

                  <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs">
                    <span className="text-slate-500 dark:text-slate-400">
                      Posted by {post.authorDisplayName} · {post.category.replace('_', ' ')}
                    </span>

                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() => handleVote(post.id)}
                        className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 font-mono cursor-pointer ${
                          post.viewerHasUpvoted
                            ? 'border-sky-600 bg-sky-50 dark:bg-sky-950/50 text-sky-700 dark:text-sky-300'
                            : 'border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                        }`}
                      >
                        <ThumbsUp className="w-3.5 h-3.5" aria-hidden="true" />
                        {post.upvoteCount}
                      </button>

                      <button
                        type="button"
                        onClick={() => setExpandedPostId(expandedPostId === post.id ? null : post.id)}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 px-2.5 py-1.5 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                      >
                        <MessageSquare className="w-3.5 h-3.5" aria-hidden="true" />
                        {post.commentCount}
                      </button>

                      <button
                        type="button"
                        onClick={() => setReportingPostId(reportingPostId === post.id ? null : post.id)}
                        aria-label={`Report post ${post.title}`}
                        className="inline-flex items-center gap-1 text-slate-500 hover:text-rose-600 px-2 py-1 cursor-pointer"
                      >
                        <Flag className="w-3.5 h-3.5" aria-hidden="true" />
                        Report
                      </button>

                      {(user?.id === post.authorId || isModerator) && (
                        <button
                          type="button"
                          onClick={() => handleDeletePost(post.id)}
                          aria-label={`Delete post ${post.title}`}
                          className="text-slate-400 hover:text-rose-600 p-1 cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Report Panel */}
                  {reportingPostId === post.id && (
                    <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center gap-2">
                      <select
                        value={reportReason}
                        onChange={(e) => setReportReason(e.target.value)}
                        className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-2.5 py-1.5 text-xs text-slate-900 dark:text-slate-100"
                      >
                        <option value="misinformation">Inaccurate / Misleading</option>
                        <option value="personal_info_pii">Contains Personal / Address Info</option>
                        <option value="medical_claim">Unsubstantiated Medical Claim</option>
                        <option value="spam_or_abuse">Spam or Abuse</option>
                        <option value="off_topic">Off Topic</option>
                      </select>
                      <input
                        type="text"
                        value={reportDetails}
                        onChange={(e) => setReportDetails(e.target.value)}
                        placeholder="Optional moderator note..."
                        className="flex-1 min-w-44 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-2.5 py-1.5 text-xs text-slate-900 dark:text-slate-100"
                      />
                      <button
                        type="button"
                        onClick={() => handleSubmitReport(post.id)}
                        className="rounded-lg bg-rose-600 hover:bg-rose-700 px-3 py-1.5 text-xs font-medium text-white cursor-pointer"
                      >
                        Submit Flag
                      </button>
                    </div>
                  )}

                  {/* Comments Thread */}
                  {expandedPostId === post.id && (
                    <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 space-y-3">
                      {(post.comments ?? []).length === 0 ? (
                        <p className="text-xs text-slate-500 dark:text-slate-400">No comments yet.</p>
                      ) : (
                        <ul className="space-y-2">
                          {(post.comments ?? []).map((c) => (
                            <li key={c.id} className="rounded-lg bg-slate-50 dark:bg-slate-950 px-3 py-2 text-xs">
                              <span className="font-medium text-slate-900 dark:text-slate-100">{c.authorDisplayName}</span>
                              <span className="text-slate-400"> · {new Date(c.createdAt).toLocaleDateString()}</span>
                              <p className="mt-0.5 text-slate-700 dark:text-slate-300">{c.body}</p>
                            </li>
                          ))}
                        </ul>
                      )}

                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={commentText}
                          onChange={(e) => setCommentText(e.target.value)}
                          placeholder={user ? 'Add a constructive neighborhood note...' : 'Sign in to comment...'}
                          className="flex-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-1.5 text-xs text-slate-900 dark:text-slate-100"
                        />
                        <button
                          type="button"
                          onClick={() => handleComment(post.id)}
                          className="rounded-lg bg-slate-900 dark:bg-slate-100 px-3 py-1.5 text-xs font-medium text-white dark:text-slate-900 cursor-pointer"
                        >
                          Reply
                        </button>
                      </div>
                    </div>
                  )}
                </article>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
