import NoteScreen from "../../../components/NoteScreen";

export default async function Page({ params }) {
  const { id } = await params;
  return <NoteScreen noteId={id} />;
}
