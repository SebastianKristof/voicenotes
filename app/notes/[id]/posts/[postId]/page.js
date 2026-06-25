import PostScreen from "../../../../../components/PostScreen";

export default async function Page({ params }) {
  const { id, postId } = await params;
  return <PostScreen noteId={id} postId={postId} />;
}
