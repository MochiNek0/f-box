import React, { useState, useEffect } from "react";
import { useTabStore } from "../../../store/useTabStore";
import { Plus, Trash2, ExternalLink, ShieldCheck } from "lucide-react";
import { Modal } from "../../common/Modal";
import { Button } from "../../common/Button";
import { Input } from "../../common/Input";
import { IconButton } from "../../common/IconButton";

interface GameItem {
  id: string;
  name: string;
  url: string;
  icon?: string;
}

const DEFAULT_GAMES: GameItem[] = [
  {
    id: "zmhj",
    name: "4399 造梦西游",
    url: "https://www.4399.com/flash/zmhj.htm",
    icon: "https://www.4399.com/favicon.ico",
  },
  {
    id: "roco",
    name: "洛克王国",
    url: "https://17roco.qq.com/",
    icon: "https://17roco.qq.com/favicon.ico",
  },
  {
    id: "seer",
    name: "赛尔号",
    url: "https://h5-seer.61.com/?from=taomee",
    icon: "https://game-res.61.com/seer/index/images/favicon.ico",
  },
  {
    id: "aola",
    name: "奥拉星",
    url: "http://aola.100bt.com/",
    icon: "https://aola.100bt.com/favicon.ico",
  },
];

export const GameLibrary: React.FC = () => {
  const { activeTabId, loadGame } = useTabStore();
  const [customGames, setCustomGames] = useState<GameItem[]>([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newName, setNewName] = useState("");
  const [newUrl, setNewUrl] = useState("");

  useEffect(() => {
    const saved = localStorage.getItem("custom_games");
    if (saved) {
      setCustomGames(JSON.parse(saved));
    }
  }, []);

  const saveCustomGames = (games: GameItem[]) => {
    setCustomGames(games);
    localStorage.setItem("custom_games", JSON.stringify(games));
  };

  const handleAddGame = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName || !newUrl) return;

    const newGame: GameItem = {
      id: `custom-${Date.now()}`,
      name: newName,
      url: newUrl,
    };

    saveCustomGames([...customGames, newGame]);
    setNewName("");
    setNewUrl("");
    setShowAddForm(false);
  };

  const removeGame = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    saveCustomGames(customGames.filter((g) => g.id !== id));
  };

  const allGames = [...DEFAULT_GAMES, ...customGames];

  return (
    <div className="p-8 bg-zinc-950 flex-grow overflow-y-auto">
      <div className="mb-8 flex items-center justify-between max-md:flex-col max-md:items-start max-md:gap-4">
        <div>
          <h1 className="text-3xl font-bold text-zinc-100 flex items-center gap-3">
            <ShieldCheck className="text-orange-500" size={32} />
            游戏库
          </h1>
          <p className="text-zinc-500 mt-1">点击卡片即可启动 Flash 游戏</p>
        </div>
        <Button
          onClick={() => setShowAddForm(true)}
          variant="secondary"
          className="flex items-center gap-2"
        >
          <Plus size={18} />
          <span>添加游戏</span>
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {allGames.map((game) => (
          <div
            key={game.id}
            onClick={() => loadGame(activeTabId, game.name, game.url)}
            className="group relative bg-zinc-900 border border-zinc-800 rounded-2xl p-6 hover:border-orange-500/50 hover:bg-zinc-800/80 transition-all cursor-pointer overflow-hidden shadow-lg max-md:p-2"
          >
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-zinc-800 rounded-xl flex items-center justify-center border border-zinc-700 group-hover:bg-orange-500/10 transition-colors">
                {game.icon ? (
                  <img
                    src={game.icon}
                    alt={game.name}
                    className="w-6 h-6"
                    onError={(e) => (e.currentTarget.style.display = "none")}
                  />
                ) : (
                  <ExternalLink
                    className="text-zinc-500 group-hover:text-orange-500"
                    size={20}
                  />
                )}
              </div>
              <div className="flex-grow min-w-0">
                <h3 className="font-semibold text-zinc-200 truncate">
                  {game.name}
                </h3>
                <p className="text-xs text-zinc-500 truncate">
                  {new URL(game.url).hostname}
                </p>
              </div>
            </div>

            <div className="flex justify-end opacity-0 group-hover:opacity-100 transition-opacity">
              {game.id.startsWith("custom-") && (
                <IconButton
                  icon={<Trash2 size={16} />}
                  onClick={(e) => removeGame(e, game.id)}
                  variant="danger"
                />
              )}
            </div>

            {/* Glossy overlay effect */}
            <div className="absolute top-0 right-0 p-2 opacity-10 group-hover:opacity-100 transition-all transform translate-x-2 -translate-y-2 group-hover:translate-x-0 group-hover:translate-y-0">
              <div className="bg-orange-500 w-12 h-12 rounded-full blur-2xl" />
            </div>
          </div>
        ))}
      </div>

      {/* Add Form Modal */}
      <Modal
        isOpen={showAddForm}
        onClose={() => setShowAddForm(false)}
        showCloseButton={false}
      >
        <h2 className="text-xl font-bold text-zinc-100 mb-6">添加自定义游戏</h2>
        <form onSubmit={handleAddGame} className="space-y-4">
          <Input
            type="text"
            autoFocus
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="例如: 森林冰火人"
            label="游戏名称"
          />
          <Input
            type="url"
            value={newUrl}
            onChange={(e) => setNewUrl(e.target.value)}
            placeholder="https://..."
            label="游戏 URL"
          />
          <div className="flex gap-4 pt-4">
            <Button
              type="button"
              onClick={() => setShowAddForm(false)}
              variant="secondary"
              fullWidth
            >
              取消
            </Button>
            <Button type="submit" variant="primary" fullWidth>
              添加
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
