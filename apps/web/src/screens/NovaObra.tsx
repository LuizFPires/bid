import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Autocomplete, Button, Icon } from '@bid/ui';
import { useCriarObra, useSugestoes } from '../data/hooks';

export function NovaObraScreen() {
  const navigate = useNavigate();
  const criar = useCriarObra();
  const obrasSug = useSugestoes('obra');
  const locaisSug = useSugestoes('local');

  const [nome, setNome] = useState('');
  const [cidade, setCidade] = useState('');

  async function salvar(e: FormEvent) {
    e.preventDefault();
    const obra = await criar.mutateAsync({ nome, cidade });
    navigate(`/obras/${obra.id}`);
  }

  return (
    <>
      <div className="crumb">
        <button onClick={() => navigate('/obras')}>Obras</button>
        <Icon name="chev" />
        <span>Nova obra</span>
      </div>
      <div className="page-head">
        <h1>Nova obra</h1>
        <p className="lead">Organize propostas e certames por obra.</p>
      </div>

      <form onSubmit={salvar}>
        <Autocomplete
          label="Nome da obra"
          placeholder="Ex.: Residencial Aurora"
          value={nome}
          onChange={setNome}
          options={(obrasSug.data ?? []).map((s) => s.texto)}
        />
        <Autocomplete
          label="Cidade / local"
          placeholder="Ex.: São Paulo · SP"
          value={cidade}
          onChange={setCidade}
          options={(locaisSug.data ?? []).map((s) => s.texto)}
        />

        {criar.isError && (
          <div className="banner warn" role="alert" style={{ marginBottom: 14 }}>
            <Icon name="alert" />
            <span>Não foi possível criar a obra. Tente novamente.</span>
          </div>
        )}

        <Button type="submit" block disabled={!nome.trim() || criar.isPending}>
          {criar.isPending ? 'Criando…' : 'Criar obra'}
        </Button>
      </form>
    </>
  );
}
