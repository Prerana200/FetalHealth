"""The hybrid model.

Classical branch: the 51 classical features from Member 1 go through a small network.
Quantum branch: Member 2's circuit (4 qubits, angle encoding, Rot layer, linear CNOTs),
                started from Member 2's trained weights and fine tuned.
Fusion: both outputs are joined and passed to one final layer that gives 3 class scores.
"""
import copy
import time

import numpy as np
import pennylane as qml
import torch
import torch.nn as nn
from sklearn.metrics import f1_score

from config import SEED


def make_qlayer(depth: int, n_qubits: int):
    dev = qml.device("default.qubit", wires=n_qubits)

    @qml.qnode(dev, interface="torch", diff_method="backprop")
    def circuit(inputs, weights):
        qml.AngleEmbedding(inputs, wires=range(n_qubits), rotation="Y")
        for layer in range(depth):
            for w in range(n_qubits):
                qml.Rot(weights[layer, w, 0], weights[layer, w, 1], weights[layer, w, 2], wires=w)
            for w in range(n_qubits - 1):
                qml.CNOT(wires=[w, w + 1])
        return [qml.expval(qml.PauliZ(w)) for w in range(n_qubits)]

    return qml.qnn.TorchLayer(circuit, {"weights": (depth, n_qubits, 3)})


class HybridNet(nn.Module):
    def __init__(self, f_mean, f_std, qw_init, n_classes=3, hidden=16, dropout=0.2, freeze_quantum=False):
        super().__init__()
        qw = np.asarray(qw_init, dtype=np.float32)
        depth, n_qubits, _ = qw.shape
        self.register_buffer("f_mean", torch.as_tensor(np.asarray(f_mean), dtype=torch.float32))
        self.register_buffer("f_std", torch.as_tensor(np.asarray(f_std), dtype=torch.float32))
        self.q = make_qlayer(depth, n_qubits)
        with torch.no_grad():
            self.q.qnode_weights["weights"].copy_(torch.as_tensor(qw))
        if freeze_quantum:
            for p in self.q.parameters():
                p.requires_grad_(False)
        self.classical = nn.Sequential(nn.Linear(len(f_mean), hidden), nn.ReLU(), nn.Dropout(dropout))
        self.head = nn.Linear(n_qubits + hidden, n_classes)

    def forward(self, f, q):
        fn = (f - self.f_mean) / self.f_std
        qo = self.q(q).float()
        return self.head(torch.cat([qo, self.classical(fn)], dim=1))


@torch.no_grad()
def predict_proba(model, F, Q, batch_size=256):
    model.eval()
    out = []
    for i in range(0, len(F), batch_size):
        f = torch.as_tensor(F[i:i + batch_size], dtype=torch.float32)
        q = torch.as_tensor(Q[i:i + batch_size], dtype=torch.float32)
        out.append(torch.softmax(model(f, q), dim=1).numpy())
    return np.concatenate(out).astype(np.float64)


def fit_hybrid(model, Ftr, Qtr, ytr, Fva, Qva, yva, epochs=40, lr=0.01,
               batch_size=64, patience=10, log=print):
    torch.manual_seed(SEED)
    Ft = torch.as_tensor(Ftr, dtype=torch.float32)
    Qt = torch.as_tensor(Qtr, dtype=torch.float32)
    yt = torch.as_tensor(ytr, dtype=torch.long)
    loss_fn = nn.CrossEntropyLoss()
    opt = torch.optim.Adam([p for p in model.parameters() if p.requires_grad], lr=lr)
    best_f1, best_state, bad, history = -1.0, None, 0, []
    t0 = time.time()
    for ep in range(1, epochs + 1):
        model.train()
        perm = torch.randperm(len(Ft))
        total = 0.0
        for i in range(0, len(perm), batch_size):
            idx = perm[i:i + batch_size]
            opt.zero_grad()
            loss = loss_fn(model(Ft[idx], Qt[idx]), yt[idx])
            loss.backward()
            opt.step()
            total += loss.item() * len(idx)
        pv = predict_proba(model, Fva, Qva)
        f1 = f1_score(yva, pv.argmax(1), average="macro")
        history.append({"epoch": ep, "train_loss": total / len(perm), "val_macro_f1": float(f1)})
        log(f"  epoch {ep:02d} loss {total / len(perm):.4f} val macro F1 {f1:.4f} ({time.time() - t0:.0f}s)")
        if f1 > best_f1:
            best_f1, best_state, bad = f1, copy.deepcopy(model.state_dict()), 0
        else:
            bad += 1
            if bad >= patience:
                log("  early stop")
                break
    model.load_state_dict(best_state)
    model.eval()
    return {"history": history, "best_val_macro_f1": float(best_f1), "train_seconds": time.time() - t0}
