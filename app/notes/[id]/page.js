import NoteScreen from "../../../components/NoteScreen";

export default function Page({ params }) {
  return <NoteScreen noteId={params.id} />;
}
