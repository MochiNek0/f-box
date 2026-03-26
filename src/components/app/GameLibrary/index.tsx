import React, { useState } from "react";
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
  const [customGames, setCustomGames] = useState<GameItem[]>(() => {
    const saved = localStorage.getItem("custom_games");
    if (!saved) return [];

    try {
      const parsed = JSON.parse(saved);
      return Array.isArray(parsed) ? (parsed as GameItem[]) : [];
    } catch {
      return [];
    }
  });
  const [showAddForm, setShowAddForm] = useState(false);
  const [newName, setNewName] = useState("");
  const [newUrl, setNewUrl] = useState("");

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
    <div className="p-gr-5 bg-background flex-grow overflow-y-auto no-scrollbar">
      <div className="mb-gr-5 flex items-center justify-between max-md:flex-row max-md:items-center max-md:gap-gr-3">
        <div>
          <h1 className="text-2xl font-black text-foreground flex items-center gap-gr-3 tracking-tight">
            <ShieldCheck className="text-primary" size={28} strokeWidth={3} />
            游戏库
          </h1>
          <p className="text-zinc-500 mt-1 text-sm font-medium">点击卡片即可启动 Flash 游戏</p>
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

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-gr-4">
        {allGames.map((game, index) => (
          <div
            key={game.id}
            onClick={() => loadGame(activeTabId, game.name, game.url)}
            className="group relative glass-card p-gr-4 card-hover-effect cursor-pointer overflow-hidden shadow-2xl animate-fade-in-up"
            style={{ animationDelay: `${index * 50}ms`, opacity: 0 }}
          >
            <div className="flex items-center gap-gr-3">
              <div className="w-gr-5 h-gr-5 bg-white/[0.03] rounded-gr-3 flex items-center justify-center border border-white/5 group-hover:bg-primary/10 group-hover:border-primary/20 transition-all duration-500">
                {game.icon ? (
                  <img
                    src={game.icon}
                    alt={game.name}
                    className="w-6 h-6 grayscale group-hover:grayscale-0 transition-all"
                    onError={(e) => (e.currentTarget.style.display = "none")}
                  />
                ) : (
                  <ExternalLink
                    className="text-zinc-600 group-hover:text-primary transition-colors"
                    size={20}
                  />
                )}
              </div>
              <div className="flex-grow min-w-0">
                <h3 className="font-black text-foreground truncate group-hover:text-primary transition-all duration-300 uppercase tracking-tighter">
                  {game.name}
                </h3>
                <p className="text-[10px] text-zinc-500 truncate font-black uppercase tracking-widest opacity-40 group-hover:opacity-100 transition-opacity">
                  {new URL(game.url).hostname}
                </p>
              </div>
              <div className="flex justify-end opacity-0 group-hover:opacity-100 transition-all translate-x-2 group-hover:translate-x-0">
                {game.id.startsWith("custom-") && (
                  <IconButton
                    icon={<Trash2 size={16} />}
                    onClick={(e) => removeGame(e, game.id)}
                    variant="danger"
                  />
                )}
              </div>
            </div>

            {/* Glossy overlay effect */}
            <div className="absolute top-0 right-0 p-2 opacity-0 group-hover:opacity-20 transition-all transform translate-x-4 -translate-y-4 group-hover:translate-x-0 group-hover:translate-y-0 duration-700">
              <div className="bg-primary w-gr-7 h-gr-7 rounded-full blur-3xl" />
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
